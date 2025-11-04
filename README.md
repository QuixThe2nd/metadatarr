# Metadatarr: The missing arr for torrent management
Like Sonarr for your torrent queue: Intelligent automation for power users managing large collections.

Metadatarr is a highly modular Torrent automation tool giving you surgical control over your torrents. It continuously monitors your BitTorrent client and applies rules you define to manage everything automatically.

## Core Features
- **Actions**: Automatically performs actions on your torrents based on custom rules IF/THEN rules (e.g. resume stopped torrents if above 95% complete, delete errored ones in a category, recheck missing files, etc.)
- **Sort**: Automatically reorders your queue based off sophisticated custom chained rules (e.g. prefer small torrents BUT de-prioritise public torrents BUT prefer Sonarr torrents BUT prefer torrent names with "S01")
- **Queue**: Automatically changes download queue size based off a configurable total size limit
- **Naming**: Parses torrent titles and automatically renames them based off custom naming schemes
- **Metadata**: Automatically fetches .torrent files for magnet links using external HTTP sources and DHT

## Overview
If you're running Sonarr/Radarr with thousands of torrents, you need Metadatarr to intelligently manage that library.

It's the automation layer that:
- Runs custom automations defined by you with customisable triggers
- Decides which torrents download first
- Decides how many torrents to download at once
- Standardises naming across your entire collection
- Automatically fetches metadata for magnet links
- Integrated with [Cross-Seed](https://cross-seed.org) for tracker upgrades
- And much more (see `./config_template/*.jsonc` for exhaustive list)

Built for users with hundreds or thousands of torrents who need enterprise-level queue management.

## Core Features
### Actions
Arguably the most powerful feature Metadatarr provides is actions. Actions are highly customisable and allow you to define custom automation rules in JSON.
- **Highly Customisable**: Actions are super customisable, so much so that it's a pseudo-DSL, with JSON syntax
- **Custom Trigger**: Configure custom triggers based on any variable (e.g. if progress < 10% && state == stopped)
- **Custom Actions**: Stop, Start, add/remove tags, change category, etc

### Queue Management
Intelligent queue management with custom flags like "Prefer S01 episodes", "Prefer private torrents", or "Finish torrents closest to completion".
- **Highly Configurable**: Sort based on custom rules you define
- **Advanced Sorting**: Multi-criteria sorting with tie-breaker logic
- **Conditional Sorting**: Define separate rules based on variables (e.g. sort checking by progress, downloads by size)
- **Download Limits**: Configure rules for how many torrents can download at a time based on size

### Renaming Rules
Configure automatic renaming based on custom schemas, making all your torrents in qBittorrent follow a uniform standard. For example, restructure names to `[title] ([year]) [resolution]`.
- **Uniform Naming**: Makes your qBittorrent and it's download folder pretty with all torrents following identical naming formats.
- **Advanced Parsing**: Parses torrent names and exposes dozens of tags for custom naming schemes.
- **Clean Up Junk**: Removes useless information like domains from torrent names.

### Metadata Recovery
When qBittorrent only has magnet links, it can't see filenames, sizes, etc until it is able to fetch the metadata. Metadatarr proactively fetches the `.torrent` file to provide this metadata immediately.
- **Multi-Source Fetching**: WebTorrent DHT, HTTP Endpoints, & Web Scraping
- **Automatic Retry**: Periodically checks old torrents to find newly available metadata
- **Local Torrent Import**: Scans configured directories for new .torrent files

### Cross-Seed Integration
Integrates with [Cross-Seed](https://cross-seed.org) so when a cross seed is found, it removes the original if it matches customisable rules, for example if original is from a public tracker.
- **Automatic Upgrades**: Trump releases based on certain rules with preferred torrents
- **Webhook Support**: Integrates with Cross-Seed via a webhook for instant replacement
- **Smart Cleanup**: Removes redundant public torrents

## Manual Install
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
To run via Docker, create a file called `docker-compose.yml` and paste the following:
```
services:
  metadatarr:
    image: ghcr.io/quixthe2nd/metadatarr:latest
    container_name: metadatarr
    restart: unless-stopped
    ports:
      - 9191:9191
    volumes:
      - /srv/docker/metadatarr:/app/metadatarr/store
      - /mnt/external/qBittorrent/Torrents:/torrents
```
Then run `docker compose up -d`

### Configure
All default configuration files are located at `./config_template/`. To change values, copy config files to `./store/config/`. Instructions for each config are provided in each file. **READ ALL CONFIG BEFORE RUNNING!** The defaults are set as examples showcasing the power of Metadatarr, not as the recommended settings.

Note that changes apply instantly on save, you do not need to restart Metadatarr.

## Usage
To start Metadatarr, run:
```
npx tsx src
```

## Uncross-Seed
To enable [Cross-Seed](https://www.cross-seed.org/) integration, [configure a webhook](https://www.cross-seed.org/docs/basics/options#notificationwebhookurls). Set the notification webhook URL to `http://localhost:9191/api/uncross-seed`.

## Triggering Jobs
Metadatarr runs automatically on an interval, the more frequently it runs, the better. However on less powerful machines, frequent runs may cause slow-downs. Depending on your rules, you might be better of setting a much slower frequency of job runs and instead configure your BitTorrent client to trigger jobs when new torrents are added. This can be done by running `curl -X POST http://localhost:9191/api/run-jobs` on torrent add (or complete).

## Contributing
Metadatarr was built to solve real-world problems managing large torrent collections. If you have similar needs or improvements, contributions are welcome!

## TODO:
### Stage 1
#### Docs:
- demo video showcasing features like sorting
- before/after photos of torrent names

#### Other:
- Create docker container

### Stage 2
#### Metadata
- Use TVDB to parse episode names
- Incremental backoff on metadata fetches

#### Move from code to config
- make Naming.formatFlags & Naming.cleanupStringFlags configurable in json

#### Queries:
- Global variables (e.g. system free space)
- Validate config type for enums like state - Right now it accepts any string, but it should only allow valid states
- Time based queries - To allow this action: Delete !noHL if lastActivity > 7d ago && seeders < 5
- Priority tags

#### Other:
- Deluge/Transmission/RTorrent support
- recross-seed: auto remove torrents from sonarr/radarr/lidarr/readarr if they have no cross-seeds, so hopefully a new cross-seedable torrent is found
- Web Dashboard
- If torrent renamed, recheck all torrents with the same name
