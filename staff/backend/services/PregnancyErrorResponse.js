'use strict';

/**
 * Maps an error to an HTTP response. Any error carrying a numeric `status`
 * (PregnancyOutcomeError, PregnancyEpisodeError) keeps its status and message;
 * everything else becomes a generic 500 with no internal message in the body.
 */
function pregnancyErrorResponse(error, genericMessage) {
    const status = error && Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : null;
    if (status && status < 500) {
        return { status, body: { success: false, message: error.message }, log: false };
    }
    return { status: 500, body: { success: false, message: genericMessage }, log: true };
}

module.exports = { pregnancyErrorResponse };
