using APIHandler.Constants;
using APIHandler.Constants.Orders;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Models.GuestSessions;
using APIHandler.Repositories.Auth;
using APIHandler.Repositories.Dishes;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Orders;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Tables;
using APIHandler.Services.Auth;
using APIHandler.Services.GroupReservations;
using APIHandler.Services.GuestSessions;
using APIHandler.Services.Locations;
using Moq;
using System.Text.Json;

namespace APIHandler.Tests.Services;

/// <summary>
/// Owner flow of the group pre-order (homework levels 1-3):
/// list of sessions, owner session id, consolidated submit and guest removal.
/// </summary>
public class GroupPreOrderOwnerFlowTests
{
    private const string OwnerId = "owner-user";
    private const string ReservationId = "reservation-1";
    private const string GroupId = "group-1";

    private readonly Mock<IGroupReservationRepository> _groupRepo = new();
    private readonly Mock<IGuestSessionRepository> _sessionRepo = new();
    private readonly Mock<IDishRepository> _dishRepo = new();
    private readonly Mock<IReservationRepository> _reservationRepo = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<ITableRepository> _tableRepo = new();
    private readonly Mock<IOrderRepository> _orderRepo = new();

    private readonly GuestSessionService _guestSessionService;
    private readonly GroupReservationService _groupReservationService;

    private readonly GroupReservation _group = new()
    {
        GroupReservationId = GroupId,
        ReservationId = ReservationId,
        ReservationToken = "token",
        Status = GroupReservationStatus.Open,
    };

    private readonly List<GuestSession> _sessions = [];

    public GroupPreOrderOwnerFlowTests()
    {
        _guestSessionService = new GuestSessionService(
            _groupRepo.Object, _sessionRepo.Object, _dishRepo.Object, _reservationRepo.Object,
            _userRepo.Object, _tableRepo.Object, _orderRepo.Object);

        _groupReservationService = new GroupReservationService(
            _groupRepo.Object, new Mock<ITableRepository>().Object, _reservationRepo.Object, _sessionRepo.Object,
            new Mock<IUserService>().Object, new Mock<ILocationService>().Object, _orderRepo.Object);

        _groupRepo.Setup(r => r.GetGroupReservationByIdAsync(GroupId)).ReturnsAsync(_group);
        _groupRepo.Setup(r => r.GetByReservationIdAsync(ReservationId)).ReturnsAsync(_group);
        _reservationRepo.Setup(r => r.GetReservationByIdAsync(ReservationId)).ReturnsAsync(new Reservation
        {
            Id = ReservationId,
            TableId = "table-1",
            WaiterId = "waiter-1",
            CustomerId = OwnerId,
            GuestCount = 4,
            Status = ReservationStatus.Reserved,
        });
        _sessionRepo.Setup(r => r.GetAllByGroupReservationIdAsync(GroupId)).ReturnsAsync(() => [.. _sessions]);
        _sessionRepo.Setup(r => r.GetByGuestSessionId(It.IsAny<string>()))
            .ReturnsAsync((string id) => _sessions.FirstOrDefault(s => s.Id == id));
        _sessionRepo.Setup(r => r.DeleteAsync(It.IsAny<GuestSession>()))
            .Callback((GuestSession s) => _sessions.RemoveAll(x => x.Id == s.Id))
            .Returns(Task.CompletedTask);
        _dishRepo.Setup(r => r.GetDishesByIdsAsync(It.IsAny<IEnumerable<string>>())).ReturnsAsync(
        [
            new Dish { Id = "dish1", Name = "Caesar Salad", Price = 180 },
            new Dish { Id = "dish2", Name = "Tom Yum", Price = 220 },
        ]);
    }

    private static GuestSession Guest(string id, bool submitted, params (string DishId, int Qty)[] dishes) => new()
    {
        Id = id,
        GroupReservationId = GroupId,
        GuestName = id,
        IsSubmitted = submitted,
        Dishes = dishes.Select(d => new OrderItem { DishId = d.DishId, Quantity = d.Qty }).ToList(),
    };

    private static Order OwnerOrder(OrderStatus status, params (string DishId, int Qty)[] dishes) => new()
    {
        OrderId = "order-1",
        CustomerId = OwnerId,
        ReservationId = ReservationId,
        ReservationAddress = "address",
        ReservationTime = "time",
        Status = status,
        Dishes = dishes.Select(d => new OrderItem { DishId = d.DishId, Quantity = d.Qty }).ToList(),
    };

    // ---------- Level 1: GET /guest/groups/{id}/sessions ----------

    [Fact]
    public async Task GetAllSessions_ReturnsParticipantsWithTotals_AndOwnerFirst()
    {
        _orderRepo.Setup(r => r.GetOrderByReservationIdAsync(ReservationId))
            .ReturnsAsync(OwnerOrder(OrderStatus.Created, ("dish1", 1)));
        _sessions.Add(Guest("andrii", true, ("dish1", 2)));
        _sessions.Add(Guest("olena", false, ("dish2", 1)));

        var result = await _guestSessionService.GetAllSessionsAsync(OwnerId, GroupId);
        var participants = result.Participants.ToList();

        Assert.Equal(3, participants.Count);
        Assert.Equal(ParticipantType.Owner, participants[0].Type);
        Assert.Equal(360, participants.Single(p => p.Id == "andrii").Total);
        Assert.Equal(220, participants.Single(p => p.Id == "olena").Total);
        Assert.Equal(760, result.Total);
        Assert.False(participants.Single(p => p.Id == "olena").IsSubmitted);
    }

    [Fact]
    public async Task GetAllSessions_EmptyGroup_ReturnsNoParticipantsAndZeroTotal()
    {
        var result = await _guestSessionService.GetAllSessionsAsync(OwnerId, GroupId);

        Assert.Empty(result.Participants);
        Assert.Equal(0, result.Total);
    }

    [Fact]
    public async Task GetAllSessions_OwnerSessionMirrorsOwnerPreOrder()
    {
        _orderRepo.Setup(r => r.GetOrderByReservationIdAsync(ReservationId))
            .ReturnsAsync(OwnerOrder(OrderStatus.SubmittedByCustomer, ("dish2", 1)));

        var result = await _guestSessionService.GetAllSessionsAsync(OwnerId, GroupId);

        var owner = Assert.Single(result.Participants);
        Assert.True(owner.IsSubmitted);
        Assert.Equal(220, owner.Total);
    }

    [Fact]
    public async Task GetAllSessions_NotOwner_ThrowsForbidden()
    {
        await Assert.ThrowsAsync<ActionForbiddenException>(() => _guestSessionService.GetAllSessionsAsync("someone-else", GroupId));
    }

    [Fact]
    public async Task GetAllSessions_UnknownGroup_ThrowsNotFound()
    {
        await Assert.ThrowsAsync<GroupReservationNotFoundException>(() => _guestSessionService.GetAllSessionsAsync(OwnerId, "missing"));
    }

    // ---------- Level 2: GET /reservations/{id}/guest-session-id ----------

    [Fact]
    public async Task GetOwnerSessionId_CreatesOwnerSessionOnFirstCall()
    {
        var result = await _groupReservationService.GetOwnerSessionIdAsync(OwnerId, ReservationId);

        Assert.Equal($"owner-{GroupId}", result.GuestSessionId);
        _sessionRepo.Verify(r => r.SaveAsync(It.Is<GuestSession>(s => s.IsOwnerSession && s.Id == result.GuestSessionId)), Times.Once);
    }

    [Fact]
    public async Task GetOwnerSessionId_ReturnsExistingOwnerSession()
    {
        _sessions.Add(new GuestSession { Id = "owner-session", GroupReservationId = GroupId, GuestName = "Owner", Dishes = [], IsOwnerSession = true });

        var result = await _groupReservationService.GetOwnerSessionIdAsync(OwnerId, ReservationId);

        Assert.Equal("owner-session", result.GuestSessionId);
    }

    [Fact]
    public async Task GetOwnerSessionId_NotOwner_ThrowsForbidden()
    {
        await Assert.ThrowsAsync<ActionForbiddenException>(() => _groupReservationService.GetOwnerSessionIdAsync("someone-else", ReservationId));
    }

    [Fact]
    public async Task GetOwnerSessionId_UnknownReservation_ThrowsNotFound()
    {
        await Assert.ThrowsAsync<ReservationNotFoundException>(() => _groupReservationService.GetOwnerSessionIdAsync(OwnerId, "missing"));
    }

    // ---------- Level 2: POST /group-reservations/{id}/submit ----------

    [Fact]
    public async Task Submit_MergesSubmittedDishesByDishId_AndUpdatesStatuses()
    {
        var order = OwnerOrder(OrderStatus.SubmittedByCustomer, ("dish1", 1));
        _orderRepo.Setup(r => r.GetOrderByReservationIdAsync(ReservationId)).ReturnsAsync(order);
        _sessions.Add(Guest("andrii", true, ("dish1", 2), ("dish2", 1)));
        _sessions.Add(Guest("olena", true, ("dish2", 1)));
        _sessions.Add(Guest("pending", false, ("dish1", 5)));

        var result = await _groupReservationService.SubmitConsolidatedPreOrderAsync(OwnerId, GroupId, ReservationId);

        Assert.Equal(3, result.Single(d => d.DishId == "dish1").Quantity);
        Assert.Equal(2, result.Single(d => d.DishId == "dish2").Quantity);
        Assert.Equal(OrderStatus.SubmittedByCustomer, order.Status);
        Assert.Equal(GroupReservationStatus.Submitted, _group.Status);
        _orderRepo.Verify(r => r.SaveOrderAsync(order), Times.Once);
    }

    [Fact]
    public async Task Submit_NoSubmittedSessions_ThrowsValidation()
    {
        _orderRepo.Setup(r => r.GetOrderByReservationIdAsync(ReservationId)).ReturnsAsync(OwnerOrder(OrderStatus.Created));
        _sessions.Add(Guest("pending", false, ("dish1", 1)));

        await Assert.ThrowsAsync<ValidationException>(() => _groupReservationService.SubmitConsolidatedPreOrderAsync(OwnerId, GroupId, ReservationId));
    }

    [Fact]
    public async Task Submit_SubmittedSessionsWithoutDishes_ThrowsValidation()
    {
        _orderRepo.Setup(r => r.GetOrderByReservationIdAsync(ReservationId)).ReturnsAsync(OwnerOrder(OrderStatus.Created));
        _sessions.Add(Guest("empty", true));

        await Assert.ThrowsAsync<ValidationException>(() => _groupReservationService.SubmitConsolidatedPreOrderAsync(OwnerId, GroupId, ReservationId));
    }

    [Fact]
    public async Task Submit_OrderNotFound_ThrowsValidation()
    {
        _sessions.Add(Guest("andrii", true, ("dish1", 1)));

        var ex = await Assert.ThrowsAsync<ValidationException>(() => _groupReservationService.SubmitConsolidatedPreOrderAsync(OwnerId, GroupId, ReservationId));
        Assert.Contains("Order", ex.Message);
    }

    [Fact]
    public async Task Submit_AlreadySubmittedGroup_ThrowsGroupReservationSubmitted()
    {
        _group.Status = GroupReservationStatus.Submitted;

        await Assert.ThrowsAsync<GroupReservationSubmittedException>(() => _groupReservationService.SubmitConsolidatedPreOrderAsync(OwnerId, GroupId, ReservationId));
    }

    [Fact]
    public async Task Submit_NotOwner_ThrowsForbidden()
    {
        await Assert.ThrowsAsync<ActionForbiddenException>(() => _groupReservationService.SubmitConsolidatedPreOrderAsync("someone-else", GroupId, ReservationId));
    }

    [Fact]
    public async Task Submit_UnknownGroup_ThrowsNotFound()
    {
        await Assert.ThrowsAsync<GroupReservationNotFoundException>(() => _groupReservationService.SubmitConsolidatedPreOrderAsync(OwnerId, "missing", ReservationId));
    }

    // ---------- Level 3: DELETE /guest/groups/{id}/sessions/{sessionId} ----------

    [Fact]
    public async Task Delete_RemovesGuest_AndReturnsUpdatedSnapshot()
    {
        _sessions.Add(Guest("andrii", true, ("dish1", 2)));
        _sessions.Add(Guest("olena", false, ("dish2", 1)));

        var result = await _guestSessionService.DeleteGuestSessionAsync(OwnerId, GroupId, "andrii");

        Assert.DoesNotContain(result.Participants, p => p.Id == "andrii");
        Assert.Contains(result.Participants, p => p.Id == "olena");
        Assert.DoesNotContain(result.Participants, p => p.Type == ParticipantType.Owner);
        Assert.Equal(220, result.Total);
    }

    [Fact]
    public async Task Delete_SessionOfAnotherGroup_ThrowsValidation()
    {
        _sessions.Add(new GuestSession { Id = "stranger", GroupReservationId = "other-group", GuestName = "x", Dishes = [] });

        await Assert.ThrowsAsync<ValidationException>(() => _guestSessionService.DeleteGuestSessionAsync(OwnerId, GroupId, "stranger"));
    }

    [Fact]
    public async Task Delete_UnknownSession_ThrowsNotFound()
    {
        await Assert.ThrowsAsync<GuestSessionNotFoundException>(() => _guestSessionService.DeleteGuestSessionAsync(OwnerId, GroupId, "missing"));
    }

    [Fact]
    public async Task Delete_OwnerSession_ThrowsValidation()
    {
        _sessions.Add(new GuestSession { Id = "owner-session", GroupReservationId = GroupId, GuestName = "Owner", Dishes = [], IsOwnerSession = true });

        await Assert.ThrowsAsync<ValidationException>(() => _guestSessionService.DeleteGuestSessionAsync(OwnerId, GroupId, "owner-session"));
    }

    [Fact]
    public async Task Delete_NotOwner_ThrowsForbidden()
    {
        _sessions.Add(Guest("andrii", true, ("dish1", 2)));

        await Assert.ThrowsAsync<ActionForbiddenException>(() => _guestSessionService.DeleteGuestSessionAsync("someone-else", GroupId, "andrii"));
    }

    // ---------- Contract: response shape from homework-backend.md ----------

    [Fact]
    public async Task SessionsResponse_IsSerializedInCamelCase()
    {
        _sessions.Add(Guest("andrii", true, ("dish1", 2)));

        var result = await _guestSessionService.GetAllSessionsAsync(OwnerId, GroupId);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(result));

        var root = json.RootElement;
        Assert.True(root.TryGetProperty("participants", out var participants));
        Assert.True(root.TryGetProperty("total", out _));
        var guest = participants.EnumerateArray().Single(p => p.GetProperty("id").GetString() == "andrii");
        Assert.Equal("Guest", guest.GetProperty("type").GetString());
        Assert.Equal("andrii", guest.GetProperty("name").GetString());
        Assert.True(guest.GetProperty("isSubmitted").GetBoolean());
        Assert.Equal(2, guest.GetProperty("items")[0].GetProperty("quantity").GetInt32());
    }
}
