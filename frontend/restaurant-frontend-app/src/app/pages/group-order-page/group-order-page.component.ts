import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of, Subscription, timer } from 'rxjs';
import { catchError, exhaustMap, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { GroupOrdersService, GroupStatus } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { Participant } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';

const SYNC_INTERVAL_MS = 15_000;

@Component({
  selector: 'app-group-order-page',
  imports: [ParticipantCardComponent, ModalComponent, CurrencyPipe, DatePipe],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly groupOrdersService = inject(GroupOrdersService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly reservationId = signal<string>('');
  readonly groupReservationId = signal<string>('');
  readonly inviteInfo = signal<GuestInvite | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly ownerSessionId = signal<string | null>(null);
  readonly status = signal<GroupStatus>('Open');

  readonly isSubmitting = signal(false);
  readonly isModalOpen = signal(false);

  readonly lastUpdatedAt = signal<Date | null>(null);
  readonly refreshError = signal<string | null>(null);

  private syncSub?: Subscription;

  readonly consolidatedOrder = computed(() => consolidatePreOrder(this.participants()));

  readonly grandTotal = computed(() => this.consolidatedOrder().total);

  readonly pendingCount = computed(() => {
    return this.participants().filter((p) => !p.isSubmitted).length;
  });

  readonly pendingWarningText = computed(() => {
    const count = this.pendingCount();
    if (count === 1) {
      return `1 participant hasn't submitted their cart yet — their dishes won't be included in the order.`;
    }
    return `${count} participants haven't submitted their cart yet — their dishes won't be included in the order.`;
  });

  readonly hasAnyDishesAdded = computed(() => {
    return this.participants().some((p) => p.items && p.items.length > 0);
  });

  readonly hasSubmittableDishes = computed(() => {
    return this.consolidatedOrder().items.length > 0;
  });

  readonly isSubmitted = computed(() => this.status() === 'Submitted');

  ngOnInit(): void {
    const resId = this.route.snapshot.paramMap.get('reservationId') ?? '';
    this.reservationId.set(resId);
    this.loadData();
  }

  loadData(): void {
    this.stopSync();
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.refreshError.set(null);

    const resId = this.reservationId();
    if (!resId) {
      this.errorMessage.set('Group reservation not found');
      this.isLoading.set(false);
      return;
    }

    this.groupOrdersService
      .getGroupInvite$(resId)
      .pipe(
        switchMap((invite) => {
          this.inviteInfo.set(invite);
          const groupId = invite.GroupReservationId;
          this.groupReservationId.set(groupId);

          return forkJoin({
            sessions: this.groupOrdersService.getSessions$(groupId),
            ownerSessionId: this.groupOrdersService.getOwnerSessionId$(resId),
            status: this.groupOrdersService.getStatus$(groupId),
          });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ sessions, ownerSessionId, status }) => {
          this.participants.set(sessions.participants);
          this.ownerSessionId.set(ownerSessionId);
          this.status.set(status.status);
          this.lastUpdatedAt.set(new Date());
          this.isLoading.set(false);

          if (status.status === 'Open') {
            this.startSync();
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          if (err?.status === 404) {
            this.errorMessage.set('Group reservation not found');
          } else {
            this.errorMessage.set('Failed to load group order');
          }
        },
      });
  }

  private startSync(): void {
    this.stopSync();

    this.syncSub = timer(SYNC_INTERVAL_MS, SYNC_INTERVAL_MS)
      .pipe(
        exhaustMap(() => this.performSync$()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private stopSync(): void {
    if (this.syncSub) {
      this.syncSub.unsubscribe();
      this.syncSub = undefined;
    }
  }

  private performSync$() {
    const groupId = this.groupReservationId();
    if (!groupId || this.isSubmitted()) {
      return of(null);
    }

    return forkJoin({
      sessions: this.groupOrdersService.getSessions$(groupId, { silent: true }),
      status: this.groupOrdersService.getStatus$(groupId, { silent: true }),
    }).pipe(
      switchMap(({ sessions, status }) => {
        this.participants.set(sessions.participants);
        this.status.set(status.status);
        this.lastUpdatedAt.set(new Date());
        this.refreshError.set(null);

        if (status.status !== 'Open') {
          this.stopSync();
        }
        return of(null);
      }),
      catchError(() => {
        this.refreshError.set("Couldn't refresh. Showing data from earlier.");
        return of(null);
      })
    );
  }

  refreshNow(): void {
    this.performSync$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  openSubmitModal(): void {
    this.isModalOpen.set(true);
  }

  closeSubmitModal(): void {
    this.isModalOpen.set(false);
  }

  confirmSubmit(): void {
    if (this.isSubmitting() || !this.hasSubmittableDishes()) {
      return;
    }

    this.isSubmitting.set(true);
    this.groupOrdersService
      .submit$(this.groupReservationId(), this.reservationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.status.set('Submitted');
          this.isSubmitting.set(false);
          this.isModalOpen.set(false);
          this.stopSync();
          this.toastService.success('Pre-order sent to the restaurant');
        },
        error: () => {
          this.isSubmitting.set(false);
          this.isModalOpen.set(false);
        },
      });
  }
}