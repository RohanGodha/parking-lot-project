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
  
  module.exports = PricingService;