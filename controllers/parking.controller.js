const { v4: uuidv4 } = require('uuid');
const { Mutex } = require('async-mutex');
const ParkingLot = require('../models/ParkingLot');
const ParkingTransaction = require('../models/ParkingTransaction');
const SpotAllocator = require('../services/SpotAllocator');
const PricingService = require('../services/PricingService');
// const logger = require('../utils/logger');

const spotMutex = new Mutex();

exports.checkIn = async (req, res) => {
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

    logger.info(`Vehicle ${vehicleId} checked in at spot ${spot.spotId}`);
  } catch (error) {
    logger.error(`Check-in error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    release();
  }
};

exports.checkOut = async (req, res) => {
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

    logger.info(`Vehicle ${transaction.vehicleId} checked out from spot ${transaction.spotId}`);
  } catch (error) {
    logger.error(`Check-out error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};