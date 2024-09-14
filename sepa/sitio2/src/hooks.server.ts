import { sequence } from '@sveltejs/kit/hooks';
import { handleErrorWithSentry, sentryHandle } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';

if (import.meta.env.PROD) {
	Sentry.init({
		dsn: 'https://1177c12a82e0a16aeb1b637bcf392f20@o4507188153548800.ingest.de.sentry.io/4507951835447376',

		tracesSampleRate: 1.0

		// uncomment the line below to enable Spotlight (https://spotlightjs.com)
		// spotlight: import.meta.env.DEV,
	});
}

// If you have custom handlers, make sure to place them after `sentryHandle()` in the `sequence` function.
export const handle = sequence(sentryHandle());

// If you have a custom error handler, pass it to `handleErrorWithSentry`
export const handleError = handleErrorWithSentry();
