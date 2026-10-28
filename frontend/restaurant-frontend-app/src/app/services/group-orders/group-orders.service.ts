import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';

export type GroupStatus = 'Open' | 'Submitted' | 'Closed';

export interface GroupStatusResponse {
  currentParticipants: number;
  maxCapacity: number;
  status: GroupStatus;
}

export interface SubmitOrderResponseItem {
  dishId: string;
  quantity: number;
}

@Injectable({
  providedIn: 'root',
})
export class GroupOrdersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getGroupInvite$(reservationId: string): Observable<GuestInvite> {
    return this.http
      .get<{ token: string }>(`${this.baseUrl}/reservations/${reservationId}/invite-token`)
      .pipe(
        switchMap(({ token }) =>
          this.http.get<GuestInvite>(`${this.baseUrl}/guest/invites/${token}`)
        )
      );
  }

  getSessions$(groupReservationId: string): Observable<GroupSessionsResponse> {
    return this.http.get<GroupSessionsResponse>(
      `${this.baseUrl}/guest/groups/${groupReservationId}/sessions`
    );
  }

  getOwnerSessionId$(reservationId: string): Observable<string> {
    return this.http
      .get<{ guestSessionId: string }>(`${this.baseUrl}/reservations/${reservationId}/guest-session-id`)
      .pipe(map((res) => res.guestSessionId));
  }

  getStatus$(groupReservationId: string): Observable<GroupStatusResponse> {
    return this.http.get<GroupStatusResponse>(
      `${this.baseUrl}/guest/groups/${groupReservationId}/status`
    );
  }

  submit$(groupReservationId: string, reservationId: string): Observable<SubmitOrderResponseItem[]> {
    return this.http.post<SubmitOrderResponseItem[]>(
      `${this.baseUrl}/group-reservations/${groupReservationId}/submit`,
      { reservationId }
    );
  }
}
