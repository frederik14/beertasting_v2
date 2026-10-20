import type { TastingSnapshot } from '../lib/types'

export const tastingSnapshot: TastingSnapshot = {
  tenant: {
    id: 'tenant-bierliefhebbers',
    name: 'Bierliefhebbers',
    slug: 'bierliefhebbers',
  },
  tasting: {
    id: 'tasting-2026-10',
    title: 'Autumn Stout & IPA Night',
    status: 'completed',
    date: '2026-10-20',
  },
  participants: [
    { id: 'p-1', displayName: 'Frederik' },
    { id: 'p-2', displayName: 'Nina' },
    { id: 'p-3', displayName: 'Jeroen' },
    { id: 'p-4', displayName: 'Lotte' },
  ],
  beers: [
    { id: 'beer-1', name: 'Black Horizon', brewery: 'Northside', style: 'Stout', alcohol: 8.2 },
    { id: 'beer-2', name: 'Citrus Riot', brewery: 'Sun Harbor', style: 'IPA', alcohol: 6.4 },
    { id: 'beer-3', name: 'Velvet Ember', brewery: 'Red Mill', style: 'Porter', alcohol: 7.1 },
    { id: 'beer-4', name: 'Golden Signal', brewery: 'Moss Valley', style: 'Pale Ale', alcohol: 5.8 },
  ],
  rows: [
    { participantId: 'p-1', beerId: 'beer-1', smell: 8, color: 9, branding: 8, taste: 9, notes: 'Roasty and smooth.' },
    { participantId: 'p-2', beerId: 'beer-1', smell: 7, color: 8, branding: 7, taste: 8 },
    { participantId: 'p-3', beerId: 'beer-1', smell: 8, color: 9, branding: 9, taste: 9 },
    { participantId: 'p-4', beerId: 'beer-1', smell: 7, color: 8, branding: 8, taste: 8 },

    { participantId: 'p-1', beerId: 'beer-2', smell: 8, color: 7, branding: 8, taste: 9 },
    { participantId: 'p-2', beerId: 'beer-2', smell: 9, color: 7, branding: 8, taste: 10 },
    { participantId: 'p-3', beerId: 'beer-2', smell: 8, color: 6, branding: 9, taste: 8 },
    { participantId: 'p-4', beerId: 'beer-2', smell: 7, color: 7, branding: 8, taste: 8 },

    { participantId: 'p-1', beerId: 'beer-3', smell: 7, color: 8, branding: 8, taste: 7 },
    { participantId: 'p-2', beerId: 'beer-3', smell: 8, color: 8, branding: 8, taste: 8 },
    { participantId: 'p-3', beerId: 'beer-3', smell: 7, color: 7, branding: 7, taste: 7 },
    { participantId: 'p-4', beerId: 'beer-3', smell: 6, color: 7, branding: 7, taste: 6 },

    { participantId: 'p-1', beerId: 'beer-4', smell: 6, color: 7, branding: 7, taste: 7 },
    { participantId: 'p-2', beerId: 'beer-4', smell: 7, color: 7, branding: 8, taste: 7 },
    { participantId: 'p-3', beerId: 'beer-4', smell: 6, color: 6, branding: 7, taste: 6 },
    { participantId: 'p-4', beerId: 'beer-4', smell: 7, color: 8, branding: 8, taste: 7 },
  ],
}
