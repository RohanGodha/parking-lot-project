const mongoose = require('mongoose');

const ParkingTransactionSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  vehicleId: { type: String, required: true },
  vehicleType: { type: String, enum: ['motorcycle', 'car', 'bus'], required: true },
  entryTime: { type: Date, required: true },
  exitTime: { type: Date },
  spotId: { type: String, required: true },
  floorNumber: { type: Number, required: true },
  amountCharged: { type: Number },
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ParkingTransaction', ParkingTransactionSchema);