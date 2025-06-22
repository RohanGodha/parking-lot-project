# parking-lot-project

# Smart Parking System

A Node.js backend for smart parking lot management with real-time updates.

## Features
- Vehicle check-in/check-out
- Dynamic spot allocation
- Real-time parking status
- Fee calculation
- WebSocket support

## Installation
1. Clone the repository
2. Run `npm install`
3. Create `.env` file (copy from `.env.example`)
4. Start MongoDB (local or via Docker)
5. Run `npm start`

## API Documentation

### Check-in Vehicle
`POST /api/check-in`
```json
{
  "vehicleId": "CAR123",
  "vehicleType": "car"
}