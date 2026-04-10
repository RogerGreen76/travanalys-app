import posthog from "posthog-js";

export function initPosthog() {
  if (
    process.env.NODE_ENV !== "production" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1"
  ) return;

  posthog.init("phc_xAvL2Iq4tFmANRE7kzbKwaSqp1HJjN7x48s3vr0CMjs", {
    api_host: "https://us.i.posthog.com",
    person_profiles: "identified_only",
    session_recording: {
      recordCrossOriginIframes: true,
      capturePerformance: false,
    },
  });
}
