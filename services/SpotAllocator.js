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
  
  module.exports = SpotAllocator;