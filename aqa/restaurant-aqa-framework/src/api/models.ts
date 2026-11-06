export interface Tokens {
  idToken: string;
  accessToken: string;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'Customer' | 'Waiter' | 'Admin';
}

export interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tokens: Tokens;
  profile: UserProfile;
}

export interface Dish {
  id: string;
  name: string;
  price: number;
}

export interface ParticipantItem {
  dish: Dish;
  quantity: number;
}

export interface Participant {
  id: string;
  type: 'Owner' | 'Guest';
  name: string;
  items: ParticipantItem[];
  total: number;
  isSubmitted: boolean;
}

export interface GroupSessions {
  participants: Participant[];
  total: number;
}

export interface Reservation {
  id: string;
  tableId: string;
  startTime: string;
  endTime: string;
  guestCount: number;
}

export interface GroupInvite {
  GroupReservationId: string;
  LocationAddress: string;
  StartTime: string;
  EndTime: string;
  MaxGuestCount: number;
}

export interface GuestSession {
  id: string;
  token: string;
  name: string;
}

export interface ConsolidatedDish {
  dishId: string;
  quantity: number;
}

export interface OrderResponse {
  orderId: string;
  reservationId: string;
  status: string | number;
  orderItems: { dish: Dish; quantity: number }[];
}
