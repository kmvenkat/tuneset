const DEVELOPER_TOKEN = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlA1WTQ2VTJYOTIifQ.eyJpYXQiOjE3Nzg2MTM0NzMsImV4cCI6MTc5NDE2NTQ3MywiaXNzIjoiWEgzWEZUOFhKWCJ9.rTfqJ8EUlFXuRG8ofhB0O8drWxXHE_kCJ5u7x4h0ItBz7nQCdP_0_AiRbPrcnhGcyhfBnOmq04ZxsR8YDwi2zA";

export function loadMusicKit() {
  return new Promise((resolve) => {
    const configure = async () => {
      if (!window.MusicKit.getInstance || !window.MusicKit.getInstance()?.developerToken) {
        await window.MusicKit.configure({
          developerToken: DEVELOPER_TOKEN,
          supportedLanguages: ["en-US"],
          app: {
            name: "Tuneset",
            build: "1.0.0",
          }
        });
      }
      resolve(window.MusicKit);
    };

    if (window.MusicKit) {
      configure();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.onload = configure;
    script.onerror = () => console.error("Failed to load MusicKit JS");
    document.head.appendChild(script);
  });
}

export async function getMusic() {
  await loadMusicKit();
  return window.MusicKit.getInstance();
}

export async function signIn() {
  const music = await getMusic();
  await music.authorize();
  return music.isAuthorized;
}

export async function signOut() {
  const music = await getMusic();
  await music.unauthorize();
}

export async function getMyPlaylists() {
  const music = await getMusic();
  const res = await music.api.music("/v1/me/library/playlists", { limit: 100 });
  const COLORS = ["#FF9F0A","#0A84FF","#BF5AF2","#30D158","#FA2D55","#FF6B6B","#5AC8FA","#FF9F0A"];
  return (res.data?.data ?? []).map((pl, i) => ({
    id: pl.id,
    name: pl.attributes.name,
    songCount: pl.attributes.trackCount || pl.relationships?.tracks?.meta?.total || 0,
    artwork: pl.attributes.artwork
      ? pl.attributes.artwork.url.replace("{w}", "80").replace("{h}", "80")
      : null,
    color: COLORS[i % COLORS.length],
    songs: [],
  }));
}

function mapLibraryTrackToSong(track) {
  return {
    id: track.id,
    appleMusicId: track.attributes?.playParams?.id ?? track.id,
    title: track.attributes?.name ?? "Unknown",
    artist: track.attributes?.artistName ?? "",
    album: track.attributes?.albumName ?? "",
    duration: Math.floor((track.attributes?.durationInMillis ?? 0) / 1000),
    artwork: track.attributes?.artwork
      ? track.attributes.artwork.url.replace("{w}", "80").replace("{h}", "80")
      : null,
  };
}

export async function getPlaylistTracks(playlistId) {
  const music = await getMusic();
  const path = `/v1/me/library/playlists/${playlistId}/tracks`;
  let res = await music.api.music(path, { limit: 100 });
  const rawTracks = [...(res.data?.data ?? [])];
  while (res.data?.next) {
    res = await music.api.music(res.data.next);
    rawTracks.push(...(res.data?.data ?? []));
  }
  const tracks = rawTracks.map(mapLibraryTrackToSong);
  const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
  tracks.totalDuration = totalDuration;
  return tracks;
}

export function isAppleMusicAuthorized() {
  return !!window.MusicKit?.getInstance()?.isAuthorized;
}
