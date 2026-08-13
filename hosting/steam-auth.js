const callback = new URL("https://vscore-api.matthieu-decesco.workers.dev/steam/auth/callback");
for (const [key, value] of new URLSearchParams(window.location.search)) {
  callback.searchParams.append(key, value);
}

const continueLink = document.getElementById("continue");
continueLink.href = callback.toString();
continueLink.hidden = false;
window.location.replace(callback.toString());
