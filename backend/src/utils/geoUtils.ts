import { GRID_SIZE_KM } from '../config/constants';

export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

export const getGridId = (latitude: number, longitude: number): string => {
  const latGrid = Math.floor(latitude / GRID_SIZE_KM);
  const lngGrid = Math.floor(longitude / GRID_SIZE_KM);
  return `${latGrid}_${lngGrid}`;
};

export const getGridCenter = (gridId: string): { lat: number; lng: number } => {
  const [latGrid, lngGrid] = gridId.split('_').map(Number);
  return {
    lat: latGrid * GRID_SIZE_KM + GRID_SIZE_KM / 2,
    lng: lngGrid * GRID_SIZE_KM + GRID_SIZE_KM / 2,
  };
};

export const getTimeslot = (date: Date = new Date()): Date => {
  const timeslot = new Date(date);
  timeslot.setMinutes(0);
  timeslot.setSeconds(0);
  timeslot.setMilliseconds(0);
  return timeslot;
};

