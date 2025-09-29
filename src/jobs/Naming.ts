import { CONFIG } from "../config";
import type Qbittorrent from "../services/qBittorrent";
import type { Torrent } from "../services/qBittorrent";
import ptt from "parse-torrent-title";

function cleanString(str: string, other = false): string {
  const charSet = new Set([' ','.','-','_']);
  let start = 0;
  let end = str.length - 1;
  
  while (start <= end && charSet.has(str.charAt(start))) start++;
  while (end >= start && charSet.has(str.charAt(end))) end--;
  
  let newString = str.slice(start, end + 1)
    .replaceAll(/\[\s*]/g, '')
    .replaceAll(/\(\s*\)/g, '')
    .replaceAll(/-\s*-/g, '')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\[\s+/g, '[')
    .replaceAll(/\s+\)/g, ')')
    .replaceAll(/\s\]+/g, ']')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\.+/g, '.')
    .replace('[[', '[')
    .replace(']]', ']')
    .replaceAll('[-', '[')
    .replaceAll('[ ', '[');
  if (other) newString = newString.replace(/[^a-zA-Z0-9]/g, ' ');
  if (newString === str) return str;
  return cleanString(newString);
}

export default class Naming {
  private readonly config = CONFIG.NAMING();
  private constructor(private readonly api: Qbittorrent, private readonly torrents: Torrent[], private readonly originalNames: Record<string, string>){}

  static async run(api: Qbittorrent, torrents: Torrent[], originalNames: Record<string, string>) {
    console.log('Renaming torrents');
    const naming = new Naming(api, torrents, originalNames);
    let changes = await naming.renameAll();
    console.log('Renamed torrents');
    return changes;
  }

  private async renameAll() {
    let changes = 0;
    for (const torrent of this.torrents) {
      const tags = torrent.tags.split(', ');
      changes += await this.renameTorrent(torrent.hash, this.originalNames[torrent.hash], torrent.name, tags.includes("!renameFailed"), tags.includes("!renamed"));
    }
    return changes;
  }

  private async renameTorrent(hash: string, origName: string | undefined, currentName: string, failedTag: boolean, renamedTag: boolean): Promise<number> {
    let changes = 0;
    const { name, other } = this.cleanName(origName ?? currentName);

    if (other.length) {
      if (this.config.TAG_FAILED_PARSING && !failedTag) {
        changes++;
        await this.api.addTags([hash], "!renameFailed");
      }
      if (this.config.TAG_SUCCESSFUL_PARSING && renamedTag) {
        changes++;
        await this.api.removeTags([hash], '!renamed');
      }
      if (this.config.SKIP_IF_UNKNOWN) return changes;
    } else {
      if (this.config.TAG_FAILED_PARSING && failedTag) {
        changes++;
        await this.api.removeTags([hash], "!renameFailed");
      }
      if (this.config.TAG_SUCCESSFUL_PARSING && !renamedTag) {
        changes++;
        await this.api.addTags([hash], '!renamed');
      }
    }

    if (currentName !== name) {
      changes++;
      await this.api.rename(hash, name);
    }

    if (this.config.RENAME_FILES) {
      const files = await this.api.files(hash);
      if (!files) return changes;
      const old_folder = files[0]?.name.split('/')[0];
      if (!old_folder) return changes;
      const { name: newFolder, other: folderOther } = this.config.FORCE_SAME_DIRECTORY_NAME ? { name, other: "" } : this.cleanName(old_folder);

      if (folderOther.length) {
        if (this.config.TAG_FAILED_PARSING) {
          changes++;
          await this.api.addTags([hash], "!renameFolderFailed");
        }
        if (this.config.SKIP_IF_UNKNOWN) return changes;
      }

      for (const file of files) {
        const oldFileName = file.name;
        const newFileName = file.name.replaceAll(old_folder, newFolder);
        if (oldFileName !== newFileName) {
          changes++;
          await this.api.renameFile(hash, oldFileName, newFileName);
        }
      }
    }
    return changes;
  }

  cleanName(_oldName: string, firstRun = true): { name: string; other: string } {
    let other = _oldName;

    for (const [find, replace] of this.config.REPLACE) other = other.replaceAll(new RegExp(find, "gi"), replace);
    for (const group of this.config.FIX_BAD_GROUPS) other = other.replace(new RegExp(` ${group}$`, "i"), ` - ${group}`);

    if (this.config.REMOVE_DOMAINS) other = other.replace(new RegExp(`\\b(?:[a-zA-Z0-9-]+\\.)*[a-zA-Z0-9-]+\\.(${this.config.REMOVE_TLDS.join('|')})\\b`, 'g'), '');
    const container = ptt.parse(other).container;
    if (this.config.TRIM_CONTAINER && container) other = other.replace(new RegExp(`.${container}$`, 'i'), '');
    const info = ptt.parse(other);

    let name = this.config.SCHEME;

    if (this.config.NO_YEAR_IN_SEASONS && 'year' in info && 'season' in info) {
      name = name.replace(String(info.year), '')
      delete info.year;
    }

    const stringKeys = ['title', 'resolution', 'codec', 'source', 'group', 'audio', 'container', 'language', 'service', 'samplerate', 'bitdepth', 'channels', 'tracker', 'season', 'episode', 'year'] as const;
    const booleanKeys = ['remux', 'extended', 'remastered', 'proper', 'repack', 'openmatte', 'unrated'] as const;

    for (const key of stringKeys) {
      if (!(key in info)) continue;

      let matches = key !== 'title' && `${key}list` in info ? info[`${key}list`]! : [info[key]!];

      // Filter redundant values
      if (key === 'audio') {
        if (matches.includes('h264') && matches.includes('x264')) matches = matches.filter(match => match !== 'h264');
        else if (matches.includes('h265') && matches.includes('x265')) matches = matches.filter(match => match !== 'h265');
      }

      // Places matches in new name
      name = name.replaceAll(`[${key}]`, matches.map(value => 
        key === 'samplerate' ? `${value} kHz` :
        key === 'source' ? 
          value === 'bluray' ? 'BluRay' : 
          value === 'web-dl' ? 'WEBDL' : String(value).toUpperCase() :
        key === 'audio' ? value === 'atmos' ? 'Atmos' : String(value).toUpperCase() :
        key === 'codec' ? ['h264', 'h265', 'x264', 'x265'].includes(String(value)) ? String(value).toLowerCase() : String(value).toUpperCase() :
        ['season', 'episode'].includes(key) ? `${key[0]?.toUpperCase()}${String(value).padStart(2, '0')}` :
        key === 'title' && this.config.FORCE_TITLE_CASE ? String(value).replace(/\b\w/g, char => char.toUpperCase()) :
        value
      ).join(this.config.SPACING));

      // Remove original text from name based off common patterns
      if (key === 'bitdepth') other = other.replace(new RegExp(`(${matches.join('|')})(?:[\\s.]?bits?)?`, 'i'), '');
      else if (key === 'samplerate') other = other.replace(new RegExp(`(${matches.join('|')})(?:[\\s.]?kHz)?`, 'i'), '');
      else if (key === 'source' && matches.includes('bdrip')) other = other.replace(/BluRayRip/i, '');
      else if (['season', 'episode'].includes(key)) other = other.replace(new RegExp(`(?:${key[0]}|${key}).?0?(?:${matches.join('|')})(?:[. ]Complete)?`, 'gi'), '');
      else if (key === 'audio') {
        if (matches.includes('ddp')) other = other.replace(/DD(?:[+P]|PA)|EAC-?3/i, '');
        else if (matches.includes('dd')) other = other.replace(/AC-?3/i, '');
      } else if (key === 'resolution') {
        if (matches.includes('4k')) other = other.replace(/\bUHD\b/i, '');
        else if (matches.includes('1080p')) other = other.replace(/\bFHD\b/i, '');
        else if (matches.includes('720p')) other = other.replace(/\bSDR\b/i, '');
      } else if (key === 'service') {
        if (matches.includes('NFLX')) other = other.replace(/[. ](?:NF|Netflix)[. ]/i, '');
        else if (matches.includes('AMZN')) other = other.replace(/[. []Amazon[. \]]/i, '');
        else if (matches.includes('HMAX')) other = other.replace(/[. []H?MAX[. \]]/i, '');
        else if (matches.includes('iT')) other = other.replace(/[. []iTunes[. \]]/i, '');
      } else if (key === 'codec') {
        if (matches.includes('h265')) other = other.replace(/hevc/i, '');
        else if (matches.includes('h264')) other = other.replace(/avc/i, '');
      } else if (key === 'channels') {
        if (matches.includes(7.1)) other = other.replace(/8(?:CH|ch)/, '');
        else if (matches.includes(5.1)) other = other.replace(/6(?:CH|ch)/, '');
        else if (matches.includes(2.0)) other = other.replace(/2(?:CH|ch)/, '');
      }

      // Remove original text from name based purely on alphanumeric values
      for (const match of matches) {
        const pattern = String(match).replace(/[^a-zA-Z0-9]/g, '').split('').join('[^a-zA-Z0-9]*');
        other = other.replace(new RegExp(pattern, 'i'), '');
      }

      delete info[key];
    }

    for (const key of booleanKeys) {
      if (info[key] === true) {
        name = name.replace(`[${key}]`, key.toUpperCase());
        if (key === 'extended') other = other.replace(/extended(?:[\s.](?:cut|edition))?/gi, '');
        else if (key === 'openmatte') other = other.replace(/open(?:[\s.]matte)?/gi, '');
        else if (key === 'repack') other = other.replace(/rerip/i, '');
        other = other.replace(new RegExp(key, 'gi'), '');
      }
      delete info[key];
    }

    // Remove unused tags
    for (const key of [...stringKeys, ...booleanKeys]) name = name.replace(`[${key}]`, '');

    other = cleanString(other, true);
    name = cleanString(name).replace('[other]', other);

    if (firstRun) {
      const reCleanName = this.cleanName(name, false).name;
      if (reCleanName !== name) name = name.length <= reCleanName.length ? name : reCleanName;
    }

    return { name, other };
  }
}
