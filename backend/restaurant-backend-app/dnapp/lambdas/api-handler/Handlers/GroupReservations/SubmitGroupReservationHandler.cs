using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Models.GroupReservation;
using APIHandler.Services.GroupReservations;
using System;
using System.Text.Json;
using System.Threading.Tasks;

namespace APIHandler.Handlers.GroupReservations;

public class SubmitGroupReservationHandler : IApiRequestHandler
{
    private readonly IGroupReservationService _groupReservationService;

    public SubmitGroupReservationHandler(IGroupReservationService groupReservationService)
    {
        _groupReservationService = groupReservationService ?? throw new ArgumentNullException(nameof(groupReservationService));
    }

    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        if (!request.TryGetPathValue("groupReservationId", out var groupReservationId))
        {
            return ResponseBuilder.CreateErrorResponse(400, "Missing 'groupReservationId' in path parameters.", context.Logger);
        }

        if (request.RequestContext?.Authorizer?.Claims == null ||
            !request.RequestContext.Authorizer.Claims.TryGetValue("sub", out var userId))
        {
            return ResponseBuilder.CreateErrorResponse(401, "Unauthorized.", context.Logger);
        }

        SubmitGroupReservationRequest? body;
        try
        {
            body = JsonSerializer.Deserialize<SubmitGroupReservationRequest>(request.Body ?? string.Empty);
        }
        catch
        {
            return ResponseBuilder.CreateErrorResponse(400, "Invalid JSON body.", context.Logger);
        }

        if (body == null || string.IsNullOrWhiteSpace(body.ReservationId))
        {
            return ResponseBuilder.CreateErrorResponse(400, "Missing 'reservationId' in request body.", context.Logger);
        }

        try
        {
            var result = await _groupReservationService.SubmitConsolidatedPreOrderAsync(userId, groupReservationId, body.ReservationId);
            return ResponseBuilder.CreateSuccessResponse(result);
        }
        catch (ReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger);
        }
        catch (GroupReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger);
        }
        catch (ActionForbiddenException ex)
        {
            return ResponseBuilder.CreateErrorResponse(403, ex.Message, context.Logger);
        }
        catch (ValidationException ex)
        {
            return ResponseBuilder.CreateErrorResponse(400, ex.Message, context.Logger);
        }
    }
}
