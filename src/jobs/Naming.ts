import { CONFIG } from "../config";
import type Qbittorrent from "../services/qBittorrent";
import type { Torrent } from "../services/qBittorrent";
import ptt from "parse-torrent-title";

function cleanString(str: string): string {
  const charSet = new Set([' ','.','-','_']);
  let start = 0;
  let end = str.length - 1;
  
  while (start <= end && charSet.has(str.charAt(start))) start++;
  while (end >= start && charSet.has(str.charAt(end))) end--;
  
  let newString = str.slice(start, end + 1)
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

export default class Naming {
  private readonly config = CONFIG.NAMING();
  private constructor(private readonly api: Qbittorrent, private readonly torrents: Torrent[], private readonly originalNames: Record<string, string>){}
  private others = new Map<string, { count: number, example: string; info: unknown }>();
  private stringKeys = ['title', 'resolution', 'color', 'codec', 'source', 'encoder', 'group', 'audio', 'container', 'language', 'service', 'samplerate', 'bitdepth', 'channels', 'tracker', 'season', 'episode', 'year'] as const;
  private booleanKeys = ['remux', 'extended', 'remastered', 'proper', 'repack', 'openmatte', 'unrated', 'internal'] as const;

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
    if (CONFIG.CORE().DEV) console.log([...this.others.entries()].sort((a, b) => b[1].count - a[1].count).map(other => `${other[0]} (${other[1].count}) - ${other[1].example} - ${JSON.stringify(other[1].info)}`))
    return changes;
  }

  private async renameTorrent(hash: string, origName: string | undefined, currentName: string, failedTag: boolean, renamedTag: boolean): Promise<number> {
    let changes = 0;
    if (!origName) {
      if (this.config.TAG_MISSING_ORIGINAL_NAME && this.torrents.find(torrent => torrent.hash === hash)!.size > 0) this.api.addTags([hash], '!missingOriginalName');
      if (this.config.FORCE_ORIGINAL_NAME) {
        console.warn(currentName, "Original name not found");
        return 0;
      }
    } else if (this.torrents.find(torrent => torrent.hash === hash)?.tags.split(', ').includes('!missingOriginalName')) {
      this.api.removeTags([hash], '!missingOriginalName');
    }
    const { name, other } = this.cleanName(origName ?? currentName);

    if (other.length) {
      if (!this.others.has(other)) this.others.set(other, { count: 1, example: origName ?? currentName, info: ptt.parse(origName ?? currentName) })
      else this.others.set(other, { count: this.others.get(other)!.count + 1, example: origName ?? currentName, info: ptt.parse(origName ?? currentName) })
      if (this.config.TAG_FAILED_PARSING && !failedTag) {
        changes++;
        await this.api.addTags([hash], "!renameFailed");
      }
      if (this.config.TAG_SUCCESSFUL_PARSING && renamedTag) {
        changes++;
        await this.api.removeTags([hash], '!renamed');
      }
      if (this.config.RESET_ON_FAIL && origName) {
        if (origName !== currentName) await this.api.rename(hash, origName);
        changes++;
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
      const parts = files[0]!.name.split('/');

      if (parts.length === 1) return changes;

      const oldFolder = parts[0];
      if (!oldFolder) return changes;
      const { name: newFolder, other: folderOther } = this.config.FORCE_SAME_DIRECTORY_NAME ? { name, other: "" } : this.cleanName(oldFolder);

      if (folderOther.length) {
        if (this.config.TAG_FAILED_PARSING) {
          changes++;
          await this.api.addTags([hash], "!renameFolderFailed");
        }
        if (this.config.SKIP_IF_UNKNOWN) return changes;
      }

      for (const file of files) {
        const oldFileName = file.name;
        const newFileName = file.name.replaceAll(oldFolder, newFolder);
        if (oldFileName !== newFileName) {
          changes++;
          await this.api.renameFile(hash, oldFileName, newFileName);
        }
      }
    }
    return changes;
  }

  cleanName(_oldName: string, firstRun = true, troubleshoot = false): { name: string; other: string; info: ReturnType<ParseTorrentTitle.ParseFunction> } {
    let other = _oldName;

    for (const [find, replace] of this.config.REPLACE) other = other.replaceAll(new RegExp(find, "gi"), replace);
    for (const group of this.config.FIX_BAD_GROUPS) other = other.replace(new RegExp(` ${group}$`, "i"), ` - ${group}`);

    if (this.config.REMOVE_DOMAINS) other = other.replace(new RegExp(`\\b(?:[a-zA-Z0-9-]+\\.)*[a-zA-Z0-9-]+\\.(${this.config.REMOVE_TLDS.join('|')})\\b`, 'g'), '');
    const container = ptt.parse(other).container;
    if (this.config.TRIM_CONTAINER && container) other = other.replace(new RegExp(`.${container}$`, 'i'), '');
    const info = ptt.parse(other);

    let name = this.config.SCHEME;

    if (this.config.NO_YEAR_IN_SEASONS && 'year' in info && 'season' in info) {
      other = other.replace(String(info.year), '')
      delete info.year;
    }

    for (const key of this.stringKeys) {
      if (!(key in info)) continue;

      let matches = key !== 'title' && `${key}list` in info ? info[`${key}list`]! : [info[key]!];
      if (troubleshoot) console.log(key, matches);

      const filtered = this.redundantFlags[key]?.(matches, other) ?? { matches, other };
      matches = filtered.matches;
      other = filtered.other;

      name = name.replaceAll(`[${key}]`, matches.map(value => this.formatFlags[key]?.(value) ?? value).join(this.config.SPACING));

      other = this.cleanupStringFlags[key]?.(matches, other) ?? other;
      
      other = this.removeAlphanumericMatches(key, matches, other)

      delete info[key];
      if (troubleshoot) console.log(other, "\n")
    }

    for (const key of this.booleanKeys) {
      if (info[key] === true) {
        name = name.replace(`[${key}]`, key.toUpperCase());
        other = this.cleanupBooleanFlags(key, other);
      }
      delete info[key];
    }

    // Remove unused tags
    for (const key of [...this.stringKeys, ...this.booleanKeys]) name = name.replace(`[${key}]`, '');

    other = cleanString(other).replace(/[^a-zA-Z0-9]/g, ' ');
    name = cleanString(name.replace('[other]', other)).trim();

    if (firstRun) {
      const reCleanName = this.cleanName(name, false).name;
      if (reCleanName !== name) name = name.length <= reCleanName.length ? name : reCleanName;
    }

    return { name, other, info };
  }

  private removeAlphanumericMatches(key: typeof this.stringKeys[number], matches: (string | number)[], other: string): string {
    for (const match of matches) {
      if (typeof match === 'number' && key !== 'year') continue; // Otherwise values like `5` for season will be replaced
      const pattern = `\\b${String(match).replace(/[^a-zA-Z0-9]/g, '').split('').join('[^a-zA-Z0-9]*')}\\b`;
      other = other.replace(new RegExp(pattern, 'i'), '');
    }
    return other;
  }

  private readonly formatFlags: Partial<Record<typeof this.stringKeys[number], (value: string | number) => string>> = {
    samplerate: value => `${value}kHz`,
    channels: value => Number(value).toFixed(1),
    source: value => ({ bluray: 'BluRay', 'web-dl': 'WEBDL' }[value] ?? String(value).toUpperCase()),
    language: value => ({ multi: 'MULTi' }[value] ?? String(value).toUpperCase()),
    audio: value => ({ atmos: 'Atmos', truehd: 'TrueHD' }[value] ?? String(value).toUpperCase()),
    codec: value => String(value)[['h264', 'h265', 'x264', 'x265'].includes(String(value)) ? 'toLowerCase' : 'toUpperCase'](),
    season: value => `S${String(value).padStart(2, '0')}`,
    episode: value => `E${String(value).padStart(2, '0')}`,
    title: value => this.config.FORCE_TITLE_CASE ? String(value).replace(/\b\w/g, char => char.toUpperCase()) : String(value)
  };

  private readonly cleanupStringFlags: Partial<Record<typeof this.stringKeys[number], (matches: (string | number)[], other: string) => string>> = {
    bitdepth: (matches, other) => other.replace(new RegExp(`(${matches.join('|')})(?:[\\s.]?bits?)?`, 'i'), ''),
    samplerate: (matches, other) => other.replace(new RegExp(`(${matches.join('|')})(?:[\\s.]?kHz)?`, 'i'), ''),
    language: (matches, other) => matches.includes('eng') ? other.replace(/English/i, '') : other,
    season: (matches, other) => other.replaceAll(new RegExp(`S(?:eason)?.?(?:${matches.map(num => String(num).padStart(2, '0')).join('|')})(?:[. ]Complete)?`, 'gi'), ''),
    episode: (matches, other) => other.replaceAll(new RegExp(`E(?:pisode)?.?(?:${matches.map(num => String(num).padStart(2, '0')).join('|')})`, 'gi'), ''),
    source: (matches, other) => {
      if (matches.includes('bdrip')) other = other.replace(/BluRayRip/i, '');
      if (matches.includes('bluray')) other = other.replace(/\b(br|blu-ray)\b/i, '');
      return other;
    },
    color: (matches, other) => {
      if (matches.includes('HDR')) other = other.replace('HDR10', '');
      if (matches.includes('DV')) other = other.replace(/\b(DoVi|Dolby Vision)\b/i, '');
      return other;
    },
    audio: (matches, other) => {
      if (matches.includes('ddp')) other = other.replace(/DD(?:\+|PA?)|EAC-?3/i, '');
      else if (matches.includes('dd')) other = other.replace(/AC-?3/i, '');
      if (matches.includes('dts-hd-ma')) other = other.replace(/DTS-HD.MA/i, '');
      for (const match of matches) other = other.replace(new RegExp(`(${match})(\\d)`, "i"), '$2');
      return other;
    },
    resolution: (matches, other) => {
      if (matches.includes('4k')) other = other.replace(/\bUHD\b/i, '');
      else if (matches.includes('1080p')) other = other.replace(/\bFHD\b/i, '').replace(/1080[pi]?/, '');
      else if (matches.includes('720p')) other = other.replace(/\bSDR\b/i, '');
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
      if (matches.includes('h265') || matches.includes('x265')) other = other.replace(/hevc/i, '');
      else if (matches.includes('h264') || matches.includes('x264')) other = other.replace(/avc/i, '');
      else if (matches.includes('dts-hd-ma')) other= other.replace(/DTS-HD[\s-.]?MA/i, '')
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

  private cleanupBooleanFlags(key: typeof this.booleanKeys[number], other: string): string {
    const cleanups = {
      extended: /extended(?:[\s.](?:cut|edition))?/gi,
      openmatte: /open(?:[\s.]matte)?/gi,
      repack: /rerip/i,
      remastered: /Remaster(?:ed)?/i
    } as const;

    if (key in cleanups) other = other.replace(cleanups[key as keyof typeof cleanups], '');
    return other.replace(new RegExp(key, 'gi'), '');
  }

  private readonly redundantFlags: Partial<Record<typeof this.stringKeys[number], (matches: (string | number)[], other: string) => { matches: (string | number)[], other: string }>> = {
    codec: (matches, other) => {
      if (matches.includes('h264') && matches.includes('x264')) {
        matches = matches.filter(match => match !== 'h264');
        other = other.replace(/h264/i, '');
      } else if (matches.includes('h265') && matches.includes('x265')) {
        matches = matches.filter(match => match !== 'h265');
        other = other.replace(/h265/i, '');
      }
      return { matches, other }
    },
    audio: (matches, other) => {
      if (matches.includes('ddp') && matches.includes('dd')) matches = matches.filter(match => match !== 'dd');
      return { matches, other }
    }
  }

  static test(name: string) {
    // @ts-expect-error:
    const naming = new Naming();
    return { ...naming.cleanName(name, false, true), info: ptt.parse(name) };
  }
}
