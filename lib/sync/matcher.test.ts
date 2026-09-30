/**
 * Simple tests for matcher - can be run with vitest
 */

import { TrackMatcher } from "./matcher";
import { NormalizedTrack } from "../providers/types";

function createTrack(overrides: Partial<NormalizedTrack> & { title: string; artists: string[] }): NormalizedTrack {
  return {
    provider: "spotify",
    providerTrackId: "test123",
    title: overrides.title,
    artists: overrides.artists,
    album: overrides.album,
    durationMs: overrides.durationMs,
    isrc: overrides.isrc,
    ...overrides,
  };
}

// Test ISRC matching
const matcher = new TrackMatcher(70);

const source = createTrack({
  title: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationMs: 200000,
  isrc: "USUG11904206",
  providerTrackId: "source1",
});

const candidateExactISRC = createTrack({
  title: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationMs: 200000,
  isrc: "USUG11904206",
  providerTrackId: "dest1",
});

const result = matcher.match(source, [candidateExactISRC]);
console.log("ISRC match test:", result.status === "matched" && result.confidence === 100 ? "PASS" : "FAIL", result);

// Test low confidence should be unmatched
const candidateLow = createTrack({
  title: "Completely Different Song",
  artists: ["Other Artist"],
  providerTrackId: "dest2",
});

const result2 = matcher.match(source, [candidateLow]);
console.log("Low confidence unmatched test:", result2.status === "unmatched" ? "PASS" : "FAIL", result2);

// Test empty candidates
const result3 = matcher.match(source, []);
console.log("Empty candidates test:", result3.status === "unmatched" ? "PASS" : "FAIL");

console.log("Matcher tests completed");
