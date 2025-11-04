import fs from 'fs';
import z from 'zod';
import { CONFIG } from "../config";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheDir = path.join(__dirname, '../store/cache/');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir)

const showCachePath = path.join(cacheDir, 'shows.json');
const episodeCachePath = path.join(cacheDir, 'episodes.json');

const ShowSchema = z.object({
  results: z.array(z.object({
    id: z.number()
  }))
});

const EpisodeSchema = z.object({
  name: z.string().optional()
});

const ShowCacheSchema = z.record(z.string(), z.number().optional());
if (!fs.existsSync(showCachePath)) fs.writeFileSync(showCachePath, '{}');
const showCache = ShowCacheSchema.parse(JSON.parse(fs.readFileSync(showCachePath).toString()));

const EpisodeCacheSchema = z.record(z.string(), z.string().optional());
if (!fs.existsSync(episodeCachePath)) fs.writeFileSync(episodeCachePath, '{}');
const episodeCache = EpisodeCacheSchema.parse(JSON.parse(fs.readFileSync(episodeCachePath).toString()));

const getShowID = async (title: string): Promise<number | undefined> => {
  if (title in showCache) return showCache[title];
  const config = CONFIG.NAMING();
  if (config.TMDB_API_KEY.length === 0) return undefined;

  console.log(`[TMDB] Show: ${title}`);
  const res = await fetch(`https://api.themoviedb.org/3/search/tv?include_adult=false&language=en-US&page=1&query=${title}`, { headers: { Authorization: `Bearer ${config.TMDB_API_KEY}` } });
  const id = ShowSchema.parse(await res.json()).results[0]?.id;

  showCache[title] = id;
  fs.writeFileSync(showCachePath, JSON.stringify(showCache));
  return id;
}

const getEpisodeTitle = async (id: number, season: number, episode: number): Promise<string | undefined> => {
  const cacheKey = `${id}S${season}E${episode}`;
  if (cacheKey in episodeCache) return episodeCache[cacheKey];
  const config = CONFIG.NAMING();
  if (config.TMDB_API_KEY.length === 0) return undefined;

  console.log(`[TMDB] Episode: ${id} S${season}E${episode}`)
  const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}/episode/${episode}`, { headers: { Authorization: `Bearer ${config.TMDB_API_KEY}` } });
  const name = EpisodeSchema.parse(await res.json()).name;

  episodeCache[cacheKey] = name;
  fs.writeFileSync(episodeCachePath, JSON.stringify(episodeCache));
  return name;
}

export const getEpisodeTitleFromName = async (title: string, season: number, episode: number): Promise<string | undefined> => {
  const id = await getShowID(title);
  if (id === undefined) return undefined;
  return getEpisodeTitle(id, season, episode);
}
