const request = require('supertest');
const app = require('../server');
const ParkingLot = require('../models/ParkingLot');
const ParkingTransaction = require('../models/ParkingTransaction');

describe('Smart Parking System', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/smartparking-test');
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ParkingLot.deleteMany();
    await ParkingTransaction.deleteMany();
  });

  describe('Check-in Process', () => {
    it('should successfully check in a car', async () => {
      const response = await request(app)
        .post('/api/check-in')
        .send({ vehicleId: 'CAR123', vehicleType: 'car' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ticketId');
      expect(response.body).toHaveProperty('spotId');
    });

    it('should fail to check in with invalid vehicle type', async () => {
      const response = await request(app)
        .post('/api/check-in')
        .send({ vehicleId: 'TRUCK1', vehicleType: 'truck' });
      
      expect(response.status).toBe(400);
    });
  });

  describe('Check-out Process', () => {
    it('should successfully check out a vehicle', async () => {
      const checkIn = await request(app)
        .post('/api/check-in')
        .send({ vehicleId: 'CAR456', vehicleType: 'car' });
      
      const response = await request(app)
        .post('/api/check-out')
        .send({ ticketId: checkIn.body.ticketId });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('amountCharged');
    });
  });

  describe('Parking Lot Status', () => {
    it('should return the current parking lot status', async () => {
      await request(app)
        .post('/api/check-in')
        .send({ vehicleId: 'BIKE1', vehicleType: 'motorcycle' });
      
      const response = await request(app)
        .get('/api/status');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('availableSpots');
    });
  });
});