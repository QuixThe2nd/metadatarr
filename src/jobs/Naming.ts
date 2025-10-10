import { CONFIG } from "../config";
import Torrent from "../classes/Torrent";
import ptt from "parse-torrent-title";

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

export default class Naming {
  private readonly config = CONFIG.NAMING();
  private constructor(private readonly torrents: Torrent[], private readonly originalNames: Record<string, string>){}
  private stringKeys = ['title', 'resolution', 'color', 'codec', 'source', 'encoder', 'group', 'audio', 'container', 'language', 'service', 'samplerate', 'bitdepth', 'channels', 'season', 'episode', 'year', 'downscaled'] as const;
  private booleanKeys = ['remux', 'extended', 'remastered', 'proper', 'repack', 'openmatte', 'unrated', 'internal', 'hybrid', 'theatrical', 'uncut', 'criterion', 'extras'] as const;

  static async run(torrents: Torrent[], originalNames: Record<string, string>) {
    const naming = new Naming(torrents.sort((a, b) => b.added_on - a.added_on), originalNames);
    return await naming.renameAll();
  }

  private async renameAll() {
    let changes = 0;
    for (const torrent of this.torrents) changes += await this.renameTorrent(torrent, this.originalNames[torrent.hash]);
    return changes;
  }

  private async renameTorrent(torrent: Torrent, origName: string | undefined): Promise<number> {
    let changes = 0;
    if (!origName) {
      if (this.config.TAG_MISSING_ORIGINAL_NAME && torrent.size > 0 && !torrent.tags.includes('!missingOriginalName')) await torrent.addTags('!missingOriginalName');
      if (this.config.FORCE_ORIGINAL_NAME) {
        if (!this.config.TAG_MISSING_ORIGINAL_NAME) console.warn(torrent.name, "Original name not found");
        return 0;
      }
    } else if (torrent.tags.includes('!missingOriginalName')) await torrent.removeTags('!missingOriginalName');
    const { name, other } = this.cleanName(origName ?? torrent.name);

    if (other.length) {
      if (this.config.TAG_FAILED_PARSING && !torrent.tags.includes("!renameFailed")) {
        changes++;
        await torrent.addTags("!renameFailed");
      }
      if (this.config.TAG_SUCCESSFUL_PARSING && torrent.tags.includes("!renamed")) {
        changes++;
        await torrent.removeTags('!renamed');
      }
      if (this.config.RESET_ON_FAIL && origName && origName !== torrent.name) {
        changes++;
        await torrent.rename(origName);
      }
      if (this.config.SKIP_IF_UNKNOWN) return changes;
    } else {
      if (this.config.TAG_FAILED_PARSING && torrent.tags.includes("!renameFailed")) {
        changes++;
        await torrent.removeTags("!renameFailed");
      }
      if (this.config.TAG_SUCCESSFUL_PARSING && !torrent.tags.includes("!renamed")) {
        changes++;
        await torrent.addTags('!renamed');
      }
    }

    if (torrent.name !== name) {
      changes++;
      await torrent.rename(name);

      if (this.config.RENAME_FILES) {
        const files = await torrent.files();
        if (!files) return changes;
        const parts = files[0]?.name.split('/');

        if (!parts || parts.length <= 1) return changes;

        const oldFolder = parts[0];
        if (!oldFolder) return changes;
        const { name: newFolder, other: folderOther } = this.config.FORCE_SAME_DIRECTORY_NAME ? { name, other: "" } : this.cleanName(oldFolder);

        if (folderOther.length) {
          if (this.config.TAG_FAILED_PARSING) {
            changes++;
            await torrent.addTags("!renameFolderFailed");
          }
          if (this.config.SKIP_IF_UNKNOWN) return changes;
        }

        for (const file of files) {
          const oldFileName = file.name;
          const newFileName = file.name.replaceAll(oldFolder, newFolder);
          if (oldFileName !== newFileName) {
            changes++;
            await torrent.renameFile(oldFileName, newFileName);
          }
        }
      }
    }
    return changes;
  }

  cleanName(_oldName: string, firstRun = true, troubleshoot = false): { name: string; other: string; info: ReturnType<ParseTorrentTitle.ParseFunction> } {
    let other = _oldName;

    for (const [find, replace] of this.config.REPLACE) other = other.replaceAll(new RegExp(find, "gi"), replace);
    for (const group of this.config.FIX_BAD_GROUPS) other = other.replace(new RegExp(`[. ]${group}\\)?$`, "i"), ` - ${group}`);

    if (this.config.REMOVE_DOMAINS && this.config.REMOVE_TLDS.length) other = other.replace(new RegExp(`\\b(?:[a-zA-Z0-9-]+\\.)*[a-zA-Z0-9-]+\\.(${this.config.REMOVE_TLDS.join('|')})\\b`, 'g'), '');
    const container = ptt.parse(other).container;
    if (this.config.TRIM_CONTAINER && container) other = other.replace(new RegExp(`.${container}$`, 'i'), '');
    const info = ptt.parse(other);

    let name = this.config.SCHEME;

    if (this.config.NO_YEAR_IN_SEASONS && 'year' in info && 'season' in info) {
      other = other.replace(String(info.year), '')
      delete info.year;
    }

    if (info.resolutionlist && info.resolutionlist.length > 1) {
      const resolutions = ['480p', '720p', '1080p', '4k']
      for (let i = 0; i < resolutions.length-1; i++) {
        const nextResolution = resolutions[i+1]!;
        if (info.resolutionlist.includes(resolutions[i]!) && (info.resolutionlist.includes(nextResolution) || (nextResolution === '4k' && info.resolutionlist.includes('UHD')))) {
          info.resolution = resolutions[i];
          info.downscaled = nextResolution;
          delete info.resolutionlist;
          break;
        }
      }
    }

    for (const key of this.stringKeys) {
      if (!(key in info)) continue;

      let matches = key !== 'title' && `${key}list` in info ? info[`${key}list`]! : [info[key]!];
      if (troubleshoot) console.log(key, matches);

      other = this.cleanupStringFlags[key]?.(matches, other) ?? other;
      other = this.removeAlphanumericMatches(key, matches, other)

      matches = this.redundantFlags[key]?.(matches) ?? matches;

      name = name.replaceAll(`[${key}]`, matches.map(value => this.formatFlags[key]?.(value) ?? value).join(this.config.SPACING));

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

    other = cleanString(other).replace(/[^a-zA-Z0-9]/g, ' ').trim();
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
      other = other.replaceAll(new RegExp(pattern, 'gi'), '');
    }
    return other;
  }

  private readonly formatFlags: Partial<Record<typeof this.stringKeys[number], (value: string | number) => string>> = {
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

  private readonly cleanupStringFlags: Partial<Record<typeof this.stringKeys[number], (matches: (string | number)[], other: string) => string>> = {
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
      if (matches.includes('4k')) other = other.replace(/\bUHD\b/i, '');
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

  private cleanupBooleanFlags(key: typeof this.booleanKeys[number], other: string): string {
    const cleanups = {
      extended: /extended(?:[\s.](?:cut|edition))?/gi,
      openmatte: /open(?:[\s.]matte)?/gi,
      repack: /rerip/i,
      remastered: /Remaster(?:ed)?/i,
      theatrical: /Theatrical(?:[. ]Cut)/i
    } as const;

    if (key in cleanups) other = other.replace(cleanups[key as keyof typeof cleanups], '');
    return other.replace(new RegExp(key, 'gi'), '');
  }

  private readonly redundantFlags: Partial<Record<typeof this.stringKeys[number], (matches: (string | number)[]) => (string | number)[]>> = {
    codec: matches => {
      if (matches.includes('h264') && matches.includes('x264')) {
        matches = matches.filter(match => match !== 'h264');
      } else if (matches.includes('h265') && matches.includes('x265')) {
        matches = matches.filter(match => match !== 'h265');
      }
      return matches
    },
    audio: matches => {
      if (matches.includes('ddp') && matches.includes('dd')) matches = matches.filter(match => match !== 'dd');
      return matches
    },
    color: matches => {
      if (matches.includes('DV') && matches.includes('HDR')) matches = matches.filter(match => match !== 'HDR');
      return matches
    }
  }

  static test(name: string, verbose=true) {
    // @ts-expect-error: Just used for tests, no api needed
    const naming = new Naming();
    return { ...naming.cleanName(name, false, verbose), info: ptt.parse(name) };
  }
}
