import { handleErrorWithSentry } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';

if (import.meta.env.PROD) {
	Sentry.init({
		dsn: 'https://1177c12a82e0a16aeb1b637bcf392f20@o4507188153548800.ingest.de.sentry.io/4507951835447376',

		tracesSampleRate: 1.0
	});
}
// If you have a custom error handler, pass it to `handleErrorWithSentry`
export const handleError = handleErrorWithSentry();
