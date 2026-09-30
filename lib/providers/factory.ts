import { MusicProvider, ProviderName } from "./types";
import { SpotifyProvider } from "./spotify/client";
import { ProviderUnsupportedOperationError } from "./errors";

// Factory to get provider instance - keeps provider-specific code isolated
const providers: Record<ProviderName, () => MusicProvider> = {
  spotify: () => new SpotifyProvider(),
  apple_music: () => {
    throw new ProviderUnsupportedOperationError("apple_music", "Apple Music provider not yet implemented");
  },
  youtube_music: () => {
    throw new ProviderUnsupportedOperationError("youtube_music", "YouTube Music provider not yet implemented");
  },
  tidal: () => {
    throw new ProviderUnsupportedOperationError("tidal", "Tidal provider not yet implemented");
  },
  deezer: () => {
    throw new ProviderUnsupportedOperationError("deezer", "Deezer provider not yet implemented");
  },
};

export function getProvider(name: ProviderName): MusicProvider {
  const factory = providers[name];
  if (!factory) {
    throw new ProviderUnsupportedOperationError(name, `Provider ${name} not supported`);
  }
  return factory();
}

export function getSupportedProviders(): ProviderName[] {
  // Only return implemented providers
  return ["spotify"];
}

export function isProviderSupported(name: string): name is ProviderName {
  return getSupportedProviders().includes(name as ProviderName);
}
