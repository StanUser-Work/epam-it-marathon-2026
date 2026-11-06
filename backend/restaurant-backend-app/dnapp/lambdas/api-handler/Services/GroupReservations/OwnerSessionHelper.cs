using APIHandler.Constants.Orders;
using APIHandler.Entities;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Orders;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace APIHandler.Services.GroupReservations;

/// <summary>
/// The Owner takes part in the group pre-order through a dedicated guest session.
/// It is created on first use and, while the group is open, mirrors the Owner's own pre-order (Order).
/// </summary>
public static class OwnerSessionHelper
{
    public const string DefaultOwnerName = "Owner";

    /// <summary>
    /// Deterministic id: parallel first requests (GET sessions + GET guest-session-id) write the same item
    /// instead of creating two owner sessions.
    /// </summary>
    public static string OwnerSessionId(string groupReservationId) => $"owner-{groupReservationId}";

    public static async Task<GuestSession> EnsureOwnerSessionAsync(
        IGuestSessionRepository guestSessionRepository,
        IOrderRepository orderRepository,
        GroupReservation groupReservation,
        Reservation reservation,
        List<GuestSession> sessions)
    {
        var ownerSessionId = OwnerSessionId(groupReservation.GroupReservationId);
        var ownerSession = sessions.FirstOrDefault(s => s.IsOwnerSession && s.Id == ownerSessionId)
            ?? sessions.FirstOrDefault(s => s.IsOwnerSession);
        var isNew = ownerSession is null;

        if (ownerSession is null)
        {
            ownerSession = new GuestSession
            {
                Id = ownerSessionId,
                GroupReservationId = groupReservation.GroupReservationId,
                GuestName = DefaultOwnerName,
                Dishes = [],
                IsOwnerSession = true,
                OwnerUserId = reservation.CustomerId,
            };
            sessions.Insert(0, ownerSession);
        }

        var changed = groupReservation.Status == GroupReservationStatus.Open
            && await SyncWithOwnerOrderAsync(orderRepository, ownerSession, reservation.Id);

        if (isNew || changed)
        {
            await guestSessionRepository.SaveAsync(ownerSession);
        }

        return ownerSession;
    }

    private static async Task<bool> SyncWithOwnerOrderAsync(IOrderRepository orderRepository, GuestSession ownerSession, string reservationId)
    {
        var order = await orderRepository.GetOrderByReservationIdAsync(reservationId);

        var dishes = order is null || order.Status == OrderStatus.Cancelled
            ? []
            : (order.Dishes ?? [])
                .Where(d => d.State != OrderItemState.Canceled && d.Quantity > 0)
                .Select(d => new OrderItem { DishId = d.DishId, Quantity = d.Quantity, State = OrderItemState.Pending })
                .ToList();

        var isSubmitted = order is not null
            && dishes.Count > 0
            && order.Status is OrderStatus.SubmittedByCustomer or OrderStatus.Submitted;

        var current = ownerSession.Dishes ?? [];
        var sameDishes = current.Count == dishes.Count
            && current.Zip(dishes).All(p => p.First.DishId == p.Second.DishId && p.First.Quantity == p.Second.Quantity);

        if (sameDishes && ownerSession.IsSubmitted == isSubmitted)
        {
            return false;
        }

        ownerSession.Dishes = dishes;
        ownerSession.IsSubmitted = isSubmitted;
        return true;
    }
}
