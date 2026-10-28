import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { GroupOrdersService, GroupStatus } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { Participant } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';

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
    this.isLoading.set(true);
    this.errorMessage.set(null);

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
        })
      )
      .subscribe({
        next: ({ sessions, ownerSessionId, status }) => {
          this.participants.set(sessions.participants);
          this.ownerSessionId.set(ownerSessionId);
          this.status.set(status.status);
          this.isLoading.set(false);
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
      .subscribe({
        next: () => {
          this.status.set('Submitted');
          this.isSubmitting.set(false);
          this.isModalOpen.set(false);
          this.toastService.success('Pre-order sent to the restaurant');
        },
        error: () => {
          this.isSubmitting.set(false);
          this.isModalOpen.set(false);
        },
      });
  }
}