import type Torrent from "../classes/Torrent";
import ptt from "parse-torrent-title";
import { CONFIG } from "../config";
import fs from 'fs';
import z from 'zod';
import { version as pttVersion } from 'parse-torrent-title/package.json';

function cleanString(str: string): string {
  const charSet = new Set([' ','.','-','_']);
  let start = 0;
  let end = str.length - 1;
  
  while (start <= end && charSet.has(str.charAt(start))) start++;
  while (end >= start && charSet.has(str.charAt(end))) end--;
  
  const newString = str.slice(start, end + 1)
    // Double Spaces
    .replaceAll(/\s{2,}/g, ' ')
    // Spaces inside brackets
    .replaceAll(/\(\s/g, '(')
    .replaceAll(/\[\s/g, '[')
    .replaceAll(/\s\)/g, ')')
    .replaceAll(/\s]/g, ']')
    // Empty Groups
    .replaceAll('[]', '')
    .replaceAll('()', '')
    .replaceAll('- -', '-')
    // Double Chars
    .replaceAll(/\.{2,}/g, '.')
    .replaceAll(/\[{2,}/g, '[')
    .replaceAll(/]{2,}/g, ']')
    // Separators in groups
    .replaceAll('[-', '[')
    .replaceAll('-]', ']')

  return newString === str ? str : cleanString(newString);
}

const CacheSchema = z.object({
  pttVersion: z.string(),
  namingSchema: z.string(),
  names: z.record(z.string(), z.object({
    name: z.string(),
    other: z.string()
  }))
});

export const stringKeys = ['title', 'resolution', 'color', 'codec', 'source', 'encoder', 'group', 'audio', 'container', 'language', 'service', 'samplerate', 'bitdepth', 'channels', 'season', 'episode', 'year', 'downscaled'] as const;

export default class Naming {
  private readonly config = CONFIG.NAMING();
  private readonly cache: z.infer<typeof CacheSchema> = { pttVersion, namingSchema: this.config.SCHEME, names: {} };

  private constructor(private readonly torrents: Torrent[], private readonly originalNames: Record<string, string>){
    if (fs.existsSync('./store/naming_cache.json')) {
      const cache = CacheSchema.parse(JSON.parse(fs.readFileSync('./store/naming_cache.json').toString()));
      if (cache.pttVersion === pttVersion && cache.namingSchema === this.config.SCHEME) this.cache = cache;
    }
  }
  private booleanKeys = ['remux', 'extended', 'remastered', 'proper', 'repack', 'openmatte', 'unrated', 'internal', 'hybrid', 'theatrical', 'uncut', 'criterion', 'extras'] as const;

  static run = (torrents: Torrent[], originalNames: Record<string, string>): Promise<{ changes: number }> => new Naming(torrents.sort((a, b) => b.added_on - a.added_on), originalNames).renameAll();

  private async renameAll(): Promise<{ changes: number }> {
    if (!this.config.ENABLED) return { changes: 0 };
    let changes = 0;
    for (const torrent of this.torrents) changes += await this.renameTorrent(torrent, this.originalNames[torrent.hash]);
    fs.writeFileSync('./store/naming_cache.json', JSON.stringify(this.cache));
    return { changes };
  }

  private handleMissingName(torrent: Torrent, origName: string | undefined): Promise<number> | number {
    if (origName !== undefined) return torrent.removeTags('!missingOriginalName');
    if (this.config.TAG_MISSING_ORIGINAL_NAME && torrent.size > 0) return torrent.addTags('!missingOriginalName');
    return 0;
  }

  private async updateParsingTags(torrent: Torrent, hasParsingErrors: boolean): Promise<number> {
    let changes = 0;
    if (hasParsingErrors) {
      if (this.config.TAG_FAILED_PARSING) changes += await torrent.addTags("!renameFailed");
      if (this.config.TAG_SUCCESSFUL_PARSING) changes += await torrent.removeTags('!renamed');
    } else {
      if (this.config.TAG_FAILED_PARSING) changes += await torrent.removeTags("!renameFailed");
      if (this.config.TAG_SUCCESSFUL_PARSING) changes += await torrent.addTags('!renamed');
    }
    return changes;
  }

  private parseName = (name: string): { name: string, other: string } => {
    if (this.cache.names[name]) return this.cache.names[name];
    const results = this.cleanName(name);
    this.cache.names[name] = results;
    return results;
  }

  private async renameTorrent(torrent: Torrent, origName: string | undefined): Promise<number> {
    if (this.config.FORCE_ORIGINAL_NAME && origName === undefined) return 0;
    let changes = await this.handleMissingName(torrent, origName)

    const { name, other } = this.parseName(origName ?? torrent.name);
    changes += await this.updateParsingTags(torrent, other.length > 0);

    if (other.length > 0) {
      if (this.config.RESET_ON_FAIL && origName !== undefined && origName !== torrent.name) changes += await torrent.rename(origName);
      if (this.config.SKIP_IF_UNKNOWN) return changes;
    }

    changes += await torrent.rename(name);
    if (this.config.RENAME_FILES) changes += await this.renameFiles(torrent, name);

    return changes;
  }

  async renameAllFiles(torrent: Torrent, files: { name: string }[], oldName: string, name: string): Promise<number> {
    let changes = 0;
    for (const file of files) {
      const oldFileName = file.name;
      const newFileName = oldFileName.replaceAll(oldName, name);
      if (oldFileName !== newFileName && await torrent.renameFile(oldFileName, newFileName) !== false) changes++;
    }
    return changes;
  }

  async renameFiles(torrent: Torrent, torrentName: string): Promise<number> {
    let changes = 0;
    const files = await torrent.files();
    if (files === false) return changes;

    const parts = files[0]?.name.split('/');
    if (!parts || parts.length <= 1) return changes;

    const oldName = parts[0];
    if (oldName === undefined) return changes;
    const { name, other } = this.config.FORCE_SAME_DIRECTORY_NAME ? { name: torrentName, other: "" } : this.cleanName(oldName);

    if (other.length > 0) {
      if (this.config.TAG_FAILED_PARSING) changes += await torrent.addTags("!renameFolderFailed");
      if (this.config.SKIP_IF_UNKNOWN) return changes;
    }

    changes += await this.renameAllFiles(torrent, files, oldName, name);

    return changes;
  }

  parse(name: string): { name: string, info: ParseTorrentTitle.DefaultParserResult } {
    for (const [find, replace] of Object.entries(this.config.REPLACE)) name = name.replaceAll(new RegExp(find, "gi"), replace);
    if (this.config.REMOVE_DOMAINS && this.config.REMOVE_TLDS.length) name = name.replace(new RegExp(`\\b(?:[a-zA-Z0-9-]+\\.)*[a-zA-Z0-9-]+\\.(${this.config.REMOVE_TLDS.join('|')})\\b`, 'g'), '');
    for (const group of this.config.FIX_BAD_GROUPS) name = name.replace(new RegExp(`[. ]${group}\\)?$`, "i"), ` - ${group}`);

    const info = ptt.parse(name);

    return this.postParse(name, info);
  }

  postParse(name: string, info: ParseTorrentTitle.DefaultParserResult): { name: string, info: ParseTorrentTitle.DefaultParserResult } {
    if (this.config.TRIM_CONTAINER && info.container !== undefined) {
      name = name.replace(new RegExp(`.${info.container}$`, 'i'), '');
      delete info.container;
    }
    if (this.config.NO_YEAR_IN_SEASONS && 'year' in info && 'season' in info) {
      name = name.replace(String(info.year), '')
      delete info.year;
    }

    info = this.detectDownscale(info);

    return { name, info };
  }

  detectDownscale(info: ParseTorrentTitle.DefaultParserResult): ParseTorrentTitle.DefaultParserResult {
    if (info.resolutionlist && info.resolutionlist.length > 1) {
      const resolutions = ['480p', '720p', '1080p', '4k']
      for (let i = 0; i < resolutions.length-1; i++) {
        const resolution = resolutions[i];
        const nextResolution = resolutions[i+1];
        if (resolution === undefined) throw new Error('WTF HAPPENED 1');
        if (nextResolution === undefined) throw new Error('WTF HAPPENED 2');
        if (info.resolutionlist.includes(resolution) && (info.resolutionlist.includes(nextResolution) || (nextResolution === '4k' && info.resolutionlist.includes('UHD')))) {
          info.resolution = resolution;
          info.downscaled = nextResolution;
          delete info.resolutionlist;
          break;
        }
      }
    }
    return info;
  }

  cleanName(oldName: string, firstRun = true): { name: string; other: string; info: ParseTorrentTitle.DefaultParserResult } {
    let { name: other, info } = this.parse(oldName);

    let name = this.config.SCHEME;
    const vals1 = this.handleStringFlags(name, other, info);
    info = vals1.info;
    name = vals1.name;
    other = vals1.other;

    const vals2 = this.handleBooleanFlags(name, other, info);
    info = vals2.info;
    name = vals2.name;
    other = vals2.other;

    // Remove unused tags
    for (const key of [...stringKeys, ...this.booleanKeys]) name = name.replace(`[${key}]`, '');

    other = cleanString(other).replace(/[^a-zA-Z0-9]/g, ' ').trim();
    name = cleanString(name.replace('[other]', other)).trim();

    if (firstRun) {
      const reCleanName = this.cleanName(name, false).name;
      if (reCleanName !== name) name = name.length <= reCleanName.length ? name : reCleanName;
    }

    return { name, other, info };
  }

  private removeAlphanumericMatches(key: typeof stringKeys[number], matches: (string | number)[], other: string): string {
    for (const match of matches) {
      if (typeof match === 'number' && key !== 'year') continue; // Otherwise values like `5` for season will be replaced
      const pattern = `\\b${String(match).replace(/[^a-zA-Z0-9]/g, '').split('').join('[^a-zA-Z0-9]*')}\\b`;
      other = other.replaceAll(new RegExp(pattern, 'gi'), '');
    }
    return other;
  }

  private readonly formatFlags: Partial<Record<typeof stringKeys[number], (value: string | number) => string>> = {
    bitdepth: value => `${value}bit`,
    downscaled: value => `DS${String(value).toUpperCase()}`,
    samplerate: value => `${value}kHz`,
    channels: value => Number(value).toFixed(1),
    source: value => ({ bluray: 'BluRay', 'web-dl': 'WEBDL' }[value] ?? String(value).toUpperCase()),
    language: value => ({ multi: 'MULTi' }[value] ?? String(value).toUpperCase()),
    audio: value => ({ atmos: 'Atmos', truehd: 'TrueHD' }[value] ?? String(value).toUpperCase()),
    codec: value => String(value)[['h264', 'h265', 'x264', 'x265'].includes(String(value)) ? 'toLowerCase' : 'toUpperCase'](),
    season: value => `S${String(value).padStart(2, '0')}`,
    episode: value => `E${String(value).padStart(2, '0')}`,
    title: value => this.config.FORCE_TITLE_CASE ? String(value).replace(/[ .]\w/g, char => char.toUpperCase()) : String(value)
  };

  private readonly cleanupStringFlags: Partial<Record<typeof stringKeys[number], (matches: (string | number)[], other: string) => string>> = {
    bitdepth: (matches, other) => other.replace(new RegExp(`(${matches.join('|')})(?:[\\s.-]?bits?)`, 'i'), ''),
    samplerate: (matches, other) => other.replace(new RegExp(`(${matches.join('|')})(?:[\\s.]?kHz)?`, 'i'), ''),
    season: (matches, other) => other.replaceAll(new RegExp(`\\bS(?:eason)?[. ]?(?:${matches.map(num => [String(num), String(num).padStart(2, '0')]).flat().join('|')})(?:[. ]Complete)?`, 'gi'), ''),
    episode: (matches, other) => other.replaceAll(new RegExp(`\\bE(?:pisode)?[. ]?(?:${matches.map(num => [String(num), String(num).padStart(2, '0')]).flat().join('|')})`, 'gi'), ''),
    language: (matches, other) => {
      if (matches.includes('eng')) other = other.replace(/English/i, '');
      if (matches.includes('romanian')) other = other.replace(/RoSubbed/i, '');
      if (matches.includes('dual')) other = other.replace(/[. ]DL[. ]/, '');
      if (matches.includes('multi')) other = other.replace(/\bMULTi(?:Lang|-audio)?\b/i, '')
      return other;
    },
    source: (matches, other) => {
      if (matches.includes('web-dl')) other = other.replace(/\bWEB(?:-?DL)?\b(?!-?RIP)/i, '');
      if (matches.includes('bdrip')) other = other.replace(/BluRayRip/i, '');
      if (matches.includes('bluray')) {
        other = other.replace(/\bBlu-?Ray\b/i, '');
        other = other.replace(/(?<=\d)BR\b/i, '');
        other = other.replace(/\bBR\b/i, '');
      }
      return other;
    },
    color: (matches, other) => {
      if (matches.includes('HDR')) other = other.replace('HDR10', '');
      if (matches.includes('DV')) other = other.replace(/\b(DoVi|Dolby Vision)\b/i, '');
      return other;
    },
    audio: (matches, other) => {
      if (matches.includes("atmos")) other = other.replace(/\b((?:DDP)?DA)(\d)/i, '$2');
      if (matches.includes('ddp')) other = other.replace(/DD(?:\+|PA?)|EAC-?3/i, '');
      else if (matches.includes('dd')) other = other.replace(/AC-?3/i, '');
      if (matches.includes('dts-hd-ma')) other = other.replace(/DTS-HD[\s-.]?(MA|Master Audio)/, '');
      for (const match of matches) other = other.replace(new RegExp(`(${match})(\\d)`, "i"), '$2');
      return other;
    },
    resolution: (matches, other) => {
      if (matches.includes('4k')) other = other.replace(/\b(UHD|2160p)\b/i, '');
      else if (matches.includes('1080p')) other = other.replace(/\bFHD\b/i, '').replace(/1080[pi]?/, '');
      return other;
    },
    downscaled: (matches, other) => {
      if (matches.includes('4k')) other = other.replace(/\b(UHD|DS4K)\b/i, '');
      else if (matches.includes('1080p')) other = other.replace(/\bFHD\b/i, '').replace(/1080[pi]?/, '');
      return other;
    },
    service: (matches, other) => {
      if (matches.includes('NFLX')) other = other.replace(/[. ](?:NF|Netflix)[. ]/i, '');
      else if (matches.includes('AMZN')) other = other.replace(/[. []Amazon[. \]]/i, '');
      else if (matches.includes('HMAX')) other = other.replace(/[. []H?MAX[. \]]/i, '');
      else if (matches.includes('iT')) other = other.replace(/[. []iTunes[. \]]/i, '');
      return other;
    },
    codec: (matches, other) => {
      if (matches.includes('h265') || matches.includes('x265')) other = other.replace(/hevc|\b[xh]264/i, '');
      else if (matches.includes('h264') || matches.includes('x264')) other = other.replace(/avc|\b[xh]264/i, '');
      return other;
    },
    channels: (matches, other) => {
      other = other.replace(Number(matches[0]).toFixed(1), '');
      other = other.replace(Number(matches[0]).toFixed(1).replace('.', ' '), '');
      if (matches.includes(7.1)) other = other.replace(/8(?:CH)/, '');
      else if (matches.includes(5.1)) other = other.replace(/6(?:CH)/, '');
      else if (matches.includes(2.0)) other = other.replace(/2(?:CH)/, '');
      return other;
    }
  }

  private parseMatches(key: typeof stringKeys[number], info: ParseTorrentTitle.DefaultParserResult): (string | number)[] {
    if (key !== 'title' && `${key}list` in info) return info[`${key}list`] ?? [];
    return info[key] !== undefined ? [info[key]] : [];
  }

  private handleStringFlags(name: string, other: string, info: ParseTorrentTitle.DefaultParserResult): { name: string, other: string, info: ParseTorrentTitle.DefaultParserResult } {
    for (const key of stringKeys) {
      if (!(key in info)) continue;

      let matches = this.parseMatches(key, info);

      other = this.removeAlphanumericMatches(key, matches, this.cleanupStringFlags[key]?.(matches, other) ?? other);
      matches = this.removeRedundantFlags(key, matches);
      name = name.replaceAll(`[${key}]`, matches.map(value => this.formatFlags[key]?.(value) ?? value).join(this.config.SPACING));

      delete info[key];
    }
    return { name, other, info };
  }

  private removeRedundantFlags(key: typeof stringKeys[number], matches: (string | number)[]): (string | number)[] {
    for (const flags of this.config.REDUNDANT_FLAGS[key] ?? []) {
      let matched = true;
      for (const flag of flags.match)
        if (!matches.includes(flag)) {
          matched = false;
          break;
        }
      if (matched) matches = [...matches.filter(match => !flags.match.includes(match)), flags.keep];
    }
    return matches;
  }

  private handleBooleanFlags(name: string, other: string, info: ParseTorrentTitle.DefaultParserResult): { name: string, other: string, info: ParseTorrentTitle.DefaultParserResult } {
    for (const key of this.booleanKeys) {
      if (info[key] === true) name = name.replace(`[${key}]`, key.toUpperCase());
      delete info[key];
    }
    return { name, other, info };
  }

  static test(name: string): { name: string; other: string, info: ParseTorrentTitle.DefaultParserResult } {
    // @ts-expect-error: Just used for tests, no api needed
    const naming = new Naming();
    return { ...naming.cleanName(name, false), info: ptt.parse(name) };
  }
}
