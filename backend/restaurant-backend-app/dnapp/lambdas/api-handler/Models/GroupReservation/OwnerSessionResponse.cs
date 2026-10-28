using System.Text.Json.Serialization;

namespace APIHandler.Models.GroupReservation;

public record OwnerSessionResponse([property: JsonPropertyName("guestSessionId")] string GuestSessionId);
