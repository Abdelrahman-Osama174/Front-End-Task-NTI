"use strict";

const bandSelect = document.getElementById("band");
const artistSelect = document.getElementById("artist");
const status = document.getElementById("status");

const bandNames = {
  beatles: "Beatles",
  stones: "Rolling Stones",
  genesis: "Genesis",
  eagles: "Eagles",
};

fetch("rockbands.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load bands (${response.status}).`);
    }

    return response.json();
  })
  .then((bands) => {
    Object.keys(bands).forEach((band) => {
      bandSelect.add(new Option(bandNames[band] || band, band));
    });

    bandSelect.addEventListener("change", () => {
      artistSelect.replaceChildren(new Option("Please select", ""));
      artistSelect.disabled = !bandSelect.value;

      (bands[bandSelect.value] || []).forEach((artist) => {
        artistSelect.add(new Option(artist.name, artist.value));
      });
    });

    artistSelect.addEventListener("change", () => {
      if (artistSelect.value) {
        window.open(artistSelect.value, "_blank", "noopener,noreferrer");
      }
    });
  })
  .catch((error) => {
    console.error("Failed to load band data:", error);
    status.textContent = "Unable to load the band list. Please try again later.";
  });
