const mongoose = require('mongoose');

const ParkingLotSchema = new mongoose.Schema({
  name: { type: String, required: true },
  floors: [{
    floorNumber: { type: Number, required: true },
    spots: [{
      spotId: { type: String, required: true, unique: true },
      spotType: { type: String, enum: ['motorcycle', 'car', 'bus'], required: true },
      isOccupied: { type: Boolean, default: false },
      vehicleId: { type: String, default: null },
      occupiedSince: { type: Date, default: null }
    }]
  }],
  hourlyRates: {
    motorcycle: { type: Number, default: process.env.MOTORCYCLE_RATE || 2 },
    car: { type: Number, default: process.env.CAR_RATE || 5 },
    bus: { type: Number, default: process.env.BUS_RATE || 10 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ParkingLot', ParkingLotSchema);