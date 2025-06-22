require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { Mutex } = require('async-mutex');

// Initialize Express app
const app = express();
app.use(express.json());

// Database models
const ParkingLotSchema = new mongoose.Schema({
  name: String,
  floors: [{
    floorNumber: Number,
    spots: [{
      spotId: { type: String, unique: true },
      spotType: { type: String, enum: ['motorcycle', 'car', 'bus'] },
      isOccupied: Boolean,
      vehicleId: String,
      occupiedSince: Date
    }]
  }],
  hourlyRates: {
    motorcycle: Number,
    car: Number,
    bus: Number
  }
});

const ParkingTransactionSchema = new mongoose.Schema({
  ticketId: { type: String, unique: true },
  vehicleId: String,
  vehicleType: { type: String, enum: ['motorcycle', 'car', 'bus'] },
  entryTime: Date,
  exitTime: Date,
  spotId: String,
  floorNumber: Number,
  amountCharged: Number,
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' }
});

const ParkingLot = mongoose.model('ParkingLot', ParkingLotSchema);
const ParkingTransaction = mongoose.model('ParkingTransaction', ParkingTransactionSchema);

// Services
class SpotAllocator {
  constructor(parkingLot) {
    this.parkingLot = parkingLot;
  }

  findAvailableSpot(vehicleType) {
    for (const floor of this.parkingLot.floors.sort((a, b) => a.floorNumber - b.floorNumber)) {
      const availableSpot = floor.spots.find(spot => 
        !spot.isOccupied && this.isSpotSuitable(spot.spotType, vehicleType)
      );
      
      if (availableSpot) {
        return {
          spotId: availableSpot.spotId,
          floorNumber: floor.floorNumber
        };
      }
    }
    return null;
  }

  isSpotSuitable(spotType, vehicleType) {
    const suitability = {
      bus: ['bus'],
      car: ['car', 'bus'],
      motorcycle: ['motorcycle', 'car', 'bus']
    };
    return suitability[vehicleType].includes(spotType);
  }
}

class PricingService {
  constructor(parkingLot) {
    this.hourlyRates = parkingLot.hourlyRates;
  }

  calculateFee(vehicleType, entryTime, exitTime) {
    const durationMs = exitTime - entryTime;
    const durationHours = Math.ceil(durationMs / (1000 * 60 * 60));
    const hourlyRate = this.hourlyRates[vehicleType];
    return durationHours * hourlyRate;
  }
}

// Initialize parking lot data
async function initializeParkingLot() {
  const existingLot = await ParkingLot.findOne();
  if (existingLot) return existingLot;

  const parkingLot = new ParkingLot({
    name: "Smart Parking Downtown",
    floors: [],
    hourlyRates: {
      motorcycle: 2,
      car: 5,
      bus: 10
    }
  });

  for (let i = 1; i <= 5; i++) {
    const floor = {
      floorNumber: i,
      spots: []
    };

    for (let j = 1; j <= 50; j++) {
      let spotType;
      if (j <= 5) spotType = 'bus';
      else if (j <= 15) spotType = 'motorcycle';
      else spotType = 'car';

      floor.spots.push({
        spotId: `F${i}S${j}`,
        spotType,
        isOccupied: false,
        vehicleId: null,
        occupiedSince: null
      });
    }

    parkingLot.floors.push(floor);
  }

  return await parkingLot.save();
}

// API Routes
const spotMutex = new Mutex();

app.post('/api/check-in', async (req, res) => {
  const { vehicleId, vehicleType } = req.body;
  
  if (!['motorcycle', 'car', 'bus'].includes(vehicleType)) {
    return res.status(400).json({ error: 'Invalid vehicle type' });
  }

  const release = await spotMutex.acquire();
  try {
    const parkingLot = await ParkingLot.findOne();
    const spotAllocator = new SpotAllocator(parkingLot);
    const spot = spotAllocator.findAvailableSpot(vehicleType);
    
    if (!spot) {
      return res.status(400).json({ error: 'No available spots' });
    }
    
    const floorIndex = parkingLot.floors.findIndex(f => f.floorNumber === spot.floorNumber);
    const spotIndex = parkingLot.floors[floorIndex].spots.findIndex(s => s.spotId === spot.spotId);
    
    parkingLot.floors[floorIndex].spots[spotIndex].isOccupied = true;
    parkingLot.floors[floorIndex].spots[spotIndex].vehicleId = vehicleId;
    parkingLot.floors[floorIndex].spots[spotIndex].occupiedSince = new Date();
    
    const transaction = new ParkingTransaction({
      ticketId: uuidv4(),
      vehicleId,
      vehicleType,
      entryTime: new Date(),
      spotId: spot.spotId,
      floorNumber: spot.floorNumber
    });

    await Promise.all([
      parkingLot.save(),
      transaction.save()
    ]);
    
    res.json({
      ticketId: transaction.ticketId,
      spotId: spot.spotId,
      floorNumber: spot.floorNumber,
      entryTime: transaction.entryTime
    });

    // Notify WebSocket clients about spot change
    wss.clients.forEach(client => {
      if (client.readyState === WebSocketServer.OPEN) {
        client.send(JSON.stringify({ 
          type: 'spot_occupied',
          spotId: spot.spotId,
          floorNumber: spot.floorNumber
        }));
      }
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    release();
  }
});

app.post('/api/check-out', async (req, res) => {
  const { ticketId } = req.body;
  
  try {
    const transaction = await ParkingTransaction.findOne({ ticketId });
    if (!transaction) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    if (transaction.exitTime) {
      return res.status(400).json({ error: 'Vehicle already checked out' });
    }
    
    const parkingLot = await ParkingLot.findOne();
    const pricingService = new PricingService(parkingLot);
    const exitTime = new Date();
    const fee = pricingService.calculateFee(
      transaction.vehicleType,
      transaction.entryTime,
      exitTime
    );
    
    transaction.exitTime = exitTime;
    transaction.amountCharged = fee;
    transaction.paymentStatus = 'paid';
    
    const floorIndex = parkingLot.floors.findIndex(f => f.floorNumber === transaction.floorNumber);
    const spotIndex = parkingLot.floors[floorIndex].spots.findIndex(s => s.spotId === transaction.spotId);
    
    parkingLot.floors[floorIndex].spots[spotIndex].isOccupied = false;
    parkingLot.floors[floorIndex].spots[spotIndex].vehicleId = null;
    parkingLot.floors[floorIndex].spots[spotIndex].occupiedSince = null;
    
    await Promise.all([
      parkingLot.save(),
      transaction.save()
    ]);
    
    res.json({
      ticketId: transaction.ticketId,
      entryTime: transaction.entryTime,
      exitTime: transaction.exitTime,
      amountCharged: fee
    });

    // Notify WebSocket clients about spot change
    wss.clients.forEach(client => {
      if (client.readyState === WebSocketServer.OPEN) {
        client.send(JSON.stringify({ 
          type: 'spot_freed',
          spotId: transaction.spotId,
          floorNumber: transaction.floorNumber
        }));
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const parkingLot = await ParkingLot.findOne();
    const status = parkingLot.floors.map(floor => ({
      floorNumber: floor.floorNumber,
      totalSpots: floor.spots.length,
      availableSpots: floor.spots.filter(spot => !spot.isOccupied).length,
      spotsByType: {
        motorcycle: {
          total: floor.spots.filter(spot => spot.spotType === 'motorcycle').length,
          available: floor.spots.filter(spot => spot.spotType === 'motorcycle' && !spot.isOccupied).length
        },
        car: {
          total: floor.spots.filter(spot => spot.spotType === 'car').length,
          available: floor.spots.filter(spot => spot.spotType === 'car' && !spot.isOccupied).length
        },
        bus: {
          total: floor.spots.filter(spot => spot.spotType === 'bus').length,
          available: floor.spots.filter(spot => spot.spotType === 'bus' && !spot.isOccupied).length
        }
      }
    }));
    
    res.json(status);
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    await initializeParkingLot();
    const server = app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
    
    // WebSocket server
    const wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
      console.log('New client connected');
      
      ws.on('close', () => {
        console.log('Client disconnected');
      });
    });
    
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();