# Metadatarr: The missing arr for torrent management
Like Sonarr for your torrent queue: Intelligent automation for power users managing large collections.

Intelligent torrent management and automation for qBittorrent. Automatically & efficiently manages your queue, standardizes torrent names, and recovers metadata. Metadatarr is made for power users with large torrent collections that want fine-grained control over their system.

## Overview
If you're running Sonarr/Radarr with hundreds of torrents queued, you need Metadatarr to intelligently manage that queue.

It's the automation layer that decides:
- Which torrents download first (smart prioritization)
- How many torrents to download at once
- Standardizes naming across your entire collection
- Instantly fetches metadata for magnet links
- Integrated with [Cross-Seed](https://cross-seed.org) for tracker upgrades
- Automatically resumes stopped & completed torrents
- Rechecks torrents with missing files
- And much more (see `store/config_template/*.jsonc` for exhaustive list)

Built for users with hundreds or thousands of torrents who need enterprise-level queue management.

## Core Features
### Queue Management
Intelligent queue management with custom flags like "Prefer S01 episodes", "Prefer private torrents", or "Finish torrents closest to completion".
- **Advanced Sorting**: Multi-criteria sorting with tie-breaker logic
- **State Aware Sorting**: Define separate rules for active, moving, and checking torrents
- **Dynamic Reconfiguration**: Hot-reload new sort rules without restarting Metadatarr
- **Highly Configurable**: Sort based on custom rules you define
- **Download Limits**: Configure rules for how many torrents can download at a time based on size

### Renaming Rules
Configure automatic renaming based on custom schemas, making all your torrents in qBittorrent follow a uniform standard. For example, restructure names to `[title] ([year]) [resolution]`.
- **Uniform Naming**: Makes your qBittorrent and it's download folder pretty with all torrents following identical naming formats.
- **Advanced Parsing**: Parses torrent names and exposes dozens of tags for custom naming schemes.
- **Cross Seeding**: Cross seeds accidental duplicates, such as identical torrents with.dots.in.their.name and torrents with spaces in their names.
- **Clean Up Junk**: Removes useless information like domains from torrent names.

### Metadata Recovery
When qBittorrent only has magnet links, it can't see filenames, sizes, etc until it is able to fetch the metadata. Metadatarr proactively fetches the `.torrent` file to provide this metadata immediately.
- **Multi-Source Fetching**: WebTorrent DHT, HTTP Endpoints, & Web Scraping
- **Automatic Retry**: Periodically checks old torrents to find newly available metadata
- **Local Torrent Import**: Scans configured directories for new .torrent files

### Cross-Seed Integration
Integrates with [Cross-Seed](https://cross-seed.org) so when it finds the same release on a private tracker, Metadatarr auto-removes the public tracker instance.
- **Automatic Upgrades**: Replace public tracker releases with private trackers
- **Webhook Support**: Integrates with Cross-Seed via a webhook for almost-instant replacement
- **Smart Cleanup**: Removes redundant public torrents

## Install
```
git clone https://github.com/QuixThe2nd/metadatarr
cd metadatarr
npm install
```

### Note
Metadatarr uses [PTT](https://github.com/clement-escolano/parse-torrent-title) as a core dependency for automated renaming.

However since Metadatarr is currently under heavy development, I maintain a [fork of PTT](https://github.com/QuixThe2nd/parse-torrent-title). The fork fixes many unsolved edge cases in the original library as well as includes new flags and handlers, however this fork has many un-reviewed changes and may result in false positives. These false positives are only ever temporary, meaning once they're patched, any false renames caused by them will be undone (assuming you setup `TORRENTS_DIR` in `naming.jsonc`).

For now, while both PTT and Metadatarr face several major changes, you must choose which fork you'd like to use. Either my fork with more handlers but more false positives, or the original with less handlers but less false positives.

After you've chosen the fork you'd like to use, you must `git clone` the fork to the same directory Metadatarr has been cloned to, so you must have a `metadatarr` and a `parse-torrent-title` folder next to each other.

This is temporary. Metadatarr will eventually migrate to using the primary repo once majority of edge cases are solved.

## Docker
To run via Docker, copy `./Dockerfile` and `./docker-compose.yml` to a folder called `metadatarr` and run `docker compose up -d`.

### Configure
1. Once installed, copy `./store/config_template` to `./store/config`. **Do not** change `config_template/`, all configuration changes should be applied to `config/`.
2. Go to `./store/config/.qbittorrent_client.jsonc` and set your qBittorrent Web UI credentials.

All other configuration is optional, the defaults are finely tuned and work out of the box. However it is **highly recommended** that you at least read through all config to ensure everything is configured how you want it.

## Usage
To start Metadatarr, run:
```
npx tsx src/index.ts
```

## Configuration
All default configuration files are located at `./store/config_template/`, you must copy this folder to `./store/config/` to change values. Config files are JSONC, supporting comments and trailing commas. Instructions for each config are provided in each file.

### Required: qBittorrent Connection
The only mandatory config that MUST be set is your qBittorrent endpoint and login credentials at `.qbittorrent_client.jsonc`.

## Uncross-Seed
To enable [Cross-Seed](https://www.cross-seed.org/) integration, [configure a webhook](https://www.cross-seed.org/docs/basics/options#notificationwebhookurls). Set the notification webhook URL to `http://localhost:9090/api/uncross-seed`.

## Contributing
Metadatarr was built to solve real-world problems managing large torrent collections. If you have similar needs or improvements, contributions are welcome!

## DOCS TODO:
- demo video showcasing features like sorting
- before/after photos of torrent names

## TODO:
- Proper IF object in config. so tag/category based features can instead be generic actions that can be done if a value is true (similar to sort config objects)
- recross-seed: auto remove torrents from sonarr/radarr/lidarr/readarr if they have no cross-seeds, so hopefully a new cross-seedable torrent is found
- Download shows in order (s01e01 before s01e02 before s02)
- Delete torrents with completed=0 matching certain strings (so i can delete individual episodes before they download so no HnR and keep only season pack)
- Incremental backoff on metadata fetches
- Web Dashboard
- If torrent renamed, recheck all torrents with the same name
- Sort torrents by seeds/peers - If you're reading this and have an idea, please submit an issue and tell me. Currently stuck here: qBittorrent only polls trackers for active torrents, so we're unable to pull swarm data from queued torrents.
- Conditional actions: Auto run actions based on custom conditions. Examples:
```json
{
  "condition": "stalled > 7d AND seeds < 2",
  "action": "move_category",
  "value": "dead"
}
{
  "condition": "progress = 0% AND added > 24h",
  "action": "set_priority", 
  "value": "lowest"
}
{
  "condition": "eta > 30d AND private = false",
  "action": "pause_until_space"
}
{
  "condition": "ratio > 3.0 AND seeding_time > 168h AND private = false",
  "action": "remove_torrent"
}
{
  "condition": "progress > 95% AND speed < 100KB/s FOR 2h",
  "action": "force_reannounce"
}
{
  "condition": "completed AND category = 'tv' AND name_contains 'S01E01'",
  "action": "set_tag",
  "value": "priority-high"
}
{
  "condition": "free_space < 500GB",
  "sort_config": "prefer_smaller_torrents.json"
}
{
  "condition": "download_speed < 50MB/s AND time_of_day = night", 
  "sort_config": "prefer_large_files.json"
}
```
