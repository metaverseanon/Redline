export type MeetupStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed' | 'expired';

export interface DriveMeetup {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserCar?: string;
  toUserId: string;
  toUserName: string;
  toUserCar?: string;
  status: MeetupStatus;
  createdAt: number;
  expiresAt: number;
  respondedAt?: number;
  fromUserLocation?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
  toUserLocation?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
}

export interface MeetupNotification {
  type: 'drive_ping' | 'ping_accepted' | 'ping_declined' | 'location_shared';
  meetupId: string;
  fromUserId: string;
  fromUserName: string;
  fromUserCar?: string;
}
