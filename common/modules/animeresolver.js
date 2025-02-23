import { anilistClient } from './anilist.js'
import { mediaCache } from './cache.js'
import { anitomyscript } from './anime.js'
import { chunks, matchKeys } from './util.js'
import Debug from 'debug'

const debug = Debug('ui:animeresolver')

const postfix = {
  1: 'st', 2: 'nd', 3: 'rd'
}

export default new class AnimeResolver {
  // name: media cache from title resolving
  animeNameCache = {}

  /**
   * @param {import('anitomyscript').AnitomyResult} obj
   * @returns {string}
   */
  getCacheKeyForTitle (obj) {
    let key = obj.anime_title
    if (obj.anime_year) key += obj.anime_year
    if (obj.release_information) key += obj.release_information
    return key
  }

  /**
   * @param {string} title
   * @returns {string[]}
   */
  alternativeTitles (title) {
    const titles = new Set()

    let modified = title
    // preemptively change S2 into Season 2 or 2nd Season, otherwise this will have accuracy issues
    const seasonMatch = title.match(/ S(\d+)/)
    if (seasonMatch) {
      if (Number(seasonMatch[1]) === 1) { // if this is S1, remove the " S1" or " S01"
        modified = title.replace(/ S(\d+)/, '')
        titles.add(modified)
      } else {
        modified = title.replace(/ S(\d+)/, ` ${Number(seasonMatch[1])}${postfix[Number(seasonMatch[1])] || 'th'} Season`)
        titles.add(modified)
        titles.add(title.replace(/ S(\d+)/, ` Season ${Number(seasonMatch[1])}`))
      }
    } else {
      titles.add(title)
    }

    // remove - :
    const specialMatch = modified.match(/[-:]/g)
    if (specialMatch) {
      modified = modified.replace(/[-:]/g, '').replace(/[ ]{2,}/, ' ')
      titles.add(modified)
    }

    // remove (TV)
    const tvMatch = modified.match(/\(tv\)/i)
    if (tvMatch) {
      modified = modified.replace(/\(tv\)/i, '')
      titles.add(modified)
    }

    // Remove (Movie)
    const movieMatch = modified.match(/\(movie\)/i) || modified.match(/movie/i)
    if (movieMatch) {
      modified = modified.replace(/\(movie\)/i, '').replace(/movie/i, '')
      titles.add(modified)
    }

    // Remove (OVA)
    const ovaMatch = modified.match(/\(ova\)/i) || modified.match(/ova/i)
    if (ovaMatch) {
      modified = modified.replace(/\(ova\)/i, '').replace(/ova/i, '')
      titles.add(modified)
    }

    // Remove (ONA)
    const onaMatch = modified.match(/\(ona\)/i) || modified.match(/ona/i)
    if (onaMatch) {
      modified = modified.replace(/\(ona\)/i, '').replace(/ona/i, '')
      titles.add(modified)
    }

    // Remove Episode Titles identified by -
    const splitMatch = title.match(/\s+-\s+/)
    if (splitMatch) {
      titles.add(title.split(/\s+-\s+/)[0].trim())
    }

    // Detect and add alternate title within parentheses
    const multiTitleMatch = modified.match(/^(.+?)\s*\((.+?)\)$/)
    if (multiTitleMatch) {
      const [_, mainTitle, altTitle] = multiTitleMatch
      titles.add(mainTitle.trim())
      titles.add(altTitle.trim())
    }

    // Remove numbers with spaces
    const numbersMatch = modified.match(/\s?\d{2,}(?:\s?\d{2,})*\s?/g, '')
    if (numbersMatch) {
      modified = modified.replace(/\s?\d{2,}(?:\s?\d{2,})*\s?/g, '')
      titles.add(modified)
    }
    return [...titles]
  }

  /**
   * resolve anime name based on file name and store it
   * @param {import('anitomyscript').AnitomyResult[]} parseObjects
   */
  async findAnimesByTitle (parseObjects) {
    if (!parseObjects.length) return
    const titleObjects = parseObjects.flatMap(obj => {
      const key = this.getCacheKeyForTitle(obj)
      const titles = this.alternativeTitles(this.cleanFileName(obj.anime_title))
      const titleObjects = titles.flatMap(title => {
        const titleObject = { title, key, isAdult: false }
        const titleVariants = [{ ...titleObject }]
        if (obj.anime_year) {
          titleVariants.unshift({ ...titleObject, year: obj.anime_year })
        }
        if (obj.release_information?.length > 0) {
          if (obj.anime_year) {
            titleVariants.unshift({...titleObject, title: title + ' ' + obj.release_information, year: obj.anime_year})
          }
          titleVariants.unshift({...titleObject, title: title + ' ' + obj.release_information})
        }
        return titleVariants
      })
      titleObjects.push({ ...titleObjects.at(-1), isAdult: true })
      return titleObjects
    })

    debug(`Finding ${titleObjects?.length} titles: ${titleObjects?.map(obj => obj.title).join(', ')}`)
    for (const chunk of chunks(titleObjects, 60)) {
      // single title has a complexity of 8.1, al limits complexity to 500, so this can be at most 62, undercut it to 60, al pagination is 50, but at most we'll do 30 titles since isAdult duplicates each title
      const search = await anilistClient.alSearchCompound(chunk)
      if (!search || search?.errors) return
      for (const [key, media] of search) {
        if (!this.animeNameCache[key]) {
          debug(`Found ${key} as ${media?.id}: ${media?.title?.userPreferred}`)
          this.animeNameCache[key] = media
        } else {
          debug(`Duplicate key found ${key} as ${this.animeNameCache[key]?.id}: ${this.animeNameCache[key]?.title?.userPreferred}, skipping new value [${media?.id}: ${media?.title?.userPreferred}]`)
        }
      }
    }
  }

  /**
   * @param {number} id
   */
  async getAnimeById (id) {
    if (mediaCache.value[id]) return mediaCache.value[id]
    const res = await anilistClient.searchIDSingle({ id })

    return res.data.Media
  }

  async findAndCacheTitle(fileName) {
    const parseObjs = await anitomyscript(fileName)
    const TYPE_EXCLUSIONS = ['ED', 'ENDING', 'NCED', 'NCOP', 'OP', 'OPENING', 'PREVIEW', 'PV']

    /** @type {Record<string, import('anitomyscript').AnitomyResult>} */
    const uniq = {}
    for (const obj of parseObjs) {
      const key = this.getCacheKeyForTitle(obj)
      if (key in this.animeNameCache) continue // skip already resolved
      if (obj.anime_type && TYPE_EXCLUSIONS.includes((Array.isArray(obj.anime_type) ? obj.anime_type[0] : obj.anime_type).toUpperCase())) continue // skip non-episode media
      uniq[key] = obj
    }
    await this.findAnimesByTitle(Object.values(uniq))
    return parseObjs
  }

  /**
   * Fixes issues with awful file names from groups like ToonsHub.
   * Because.They.Cant.Take.Two.Seconds.To.Design.A.Better.Name.Scheme.
   *
   * @param fileName Array or fileNames or a single fileName to be cleansed.
   * @returns {*}
   */
  cleanFileName(fileName) {
    const cleanName = (name) => {
      // Preserve specific patterns
      name = name
          .replace(/\b([A-Za-z]{3}\d)\.(\d)\b/g, '<<AUDIO_$1_$2>>')     // For AAC2.0, DDP2.0, etc.
          .replace(/\b(H|X)\.(\d{3})\b/g, '<<RES_$1_$2>>')              // For H.264, H.265, X.265, etc.
          .replace(/\b5\.1\b/g, '<<CHANNEL_5_1>>')                      // For 5.1 channels
          .replace(/\bFLAC5\.1\b/g, '<<AUDIO_FLAC_5_1>>')               // For FLAC5.1
          .replace(/\bVol\.(\d+)\b/g, '<<VOL_$1>>')                     // For Vol. followed by any digits

      // Remove file extensions and replace all remaining periods with spaces
      name = name.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpeg|mpg|3gp|ogg|ogv)$/i, '').replace(/\./g, ' ')

      // Fix common naming issues
      name = name
          .replace('1-2', '1/2').replace('1_2', '1/2') // Ranma 1/2 fix.
          .replace(/new /i, '') // Prince of Tennis fix.
          .replace(/Link Click (Season\s*3|S\s*3|\s*03)/i, 'Link Click: Bridon Arc') // Link Click S3 fix.

      // Restore preserved patterns by converting markers back
      name = name
          .replace(/<<AUDIO_([A-Za-z]{3}\d)_(\d)>>/g, '$1.$2')          // For AAC2.0, DDP2.0, etc.
          .replace(/<<RES_([HX])_(\d{3})>>/g, '$1.$2')                  // For H.264, H.265, X.265, etc.
          .replace(/<<CHANNEL_5_1>>/g, '5.1')                           // For 5.1 channels
          .replace(/<<AUDIO_FLAC_5_1>>/g, 'FLAC5.1')                    // For FLAC5.1
          .replace(/<<VOL_(\d+)>>/g, 'Vol.$1')                          // For Vol. followed by any digits

      // Remove extra spaces (collapse multiple spaces into one)
      return name.replace(/\s+/g, ' ').trim()
    }
    return typeof fileName === 'string' ? cleanName(fileName) : fileName?.map(name => cleanName(name))
  }

  /**
   * Checks if any of the media titles matches the parsed anime title.
   *
   * @param {Object} parseObj - The parsed object containing details about the anime episode (e.g., title, episode number).
   * @param {Object} media - The media object that contains data about the anime (e.g., title, episodes, format).
   * @param {string[]} titleKeys - The list of title keys to match against when verifying media (e.g., 'title.english', 'title.userPreferred').
   * @param {number} threshold - The threshold value to use when comparing titles for similarity (0 to 1 scale).
   *
   * @returns {boolean} If any of the media titles matches the parsed anime title.
   */
  isVerified(media, parseObj, titleKeys, threshold) {
    const hasSeason = matchKeys(media, 'Season', titleKeys, threshold)
    return (!parseObj?.anime_year || (media?.seasonYear >= Number(parseObj?.anime_year))) && !(!matchKeys(media, (!parseObj?.anime_season || !(Number(parseObj?.anime_season) > 1) || !hasSeason) ? parseObj?.anime_title : parseObj?.anime_title?.replace(/S\d+|season-\d+/gi, '') + 'Season ' + Number(parseObj?.anime_season), titleKeys, threshold) && !matchKeys(media, parseObj?.anime_title?.replace(/S\d+|season-\d+/gi, '') + (hasSeason && parseObj?.anime_season ? 'Season ' + Number(parseObj?.anime_season) : ''), titleKeys, threshold) && (!parseObj?.anime_season || !(Number(parseObj?.anime_season) > 1) || !matchKeys(media, parseObj?.anime_title?.replace(/S\d+|season-\d+/gi, `Season ${parseObj?.anime_season}`), titleKeys, 0.3)))
  }

  // TODO: anidb aka true episodes need to be mapped to anilist episodes a bit better, shit like mushoku offsets caused by episode 0's in between seasons
  // TODO: attempt to map series missing from anilist by searching myanimelist, example; 69: Itsuwari no Bishou
  /**
   * Resolves anime metadata from a given file name.
   * @param {string | string[]} fileName
   * @returns {Promise<any[]>}
   */
  async resolveFileAnime(fileName) {
    if (!fileName) return [{}]
    const parseObjs = await this.findAndCacheTitle(this.cleanFileName(fileName))
    const fileAnimes = []
    for (let parseObj of parseObjs) {
      let failed = false
      let episode
      let media = this.animeNameCache[this.getCacheKeyForTitle(parseObj)]
      const threshold = parseObj?.anime_title?.length > 15 ? 0.2 : parseObj?.anime_title?.length > 9 ? 0.15 : 0.1 // play nice with small anime titles
      const titleKeys = ['title.userPreferred', 'title.english', 'title.romaji', 'title.native', 'synonyms']
      let needsVerification = !media || !this.isVerified(media, parseObj, titleKeys, threshold)
      // resolve episode, if movie, dont.
      let maxep = media?.nextAiringEpisode?.episode || media?.episodes
      debug(`Resolving ${parseObj?.anime_title} ${parseObj?.episode_number} ${maxep} ${media?.title?.userPreferred} ${media?.format} verified:${!needsVerification}`)
      if ((media?.format !== 'MOVIE' || maxep) && parseObj.episode_number) {
        if (Array.isArray(parseObj.episode_number)) {
          // is an episode range
          if (parseInt(parseObj.episode_number[0]) === 1) {
            debug('Range starts at 1')
            // if it starts with #1 and overflows then it includes more than 1 season in a batch, cant fix this cleanly, name is parsed per-file basis so this shouldn't be an issue
            episode = `${Number(parseObj.episode_number[0])} ~ ${Number(parseObj.episode_number[1])}`
            if (needsVerification) {
              const mediaSearch = (await this.manualMediaSearch(parseObj, media, titleKeys, threshold))
              media = mediaSearch.media
              failed = mediaSearch.failed
            }
          } else {
            if (maxep && parseInt(parseObj.episode_number[1]) > maxep) {
              const result = await this.findResult(parseObj, maxep, 0, media, titleKeys, threshold)
              parseObj = result.parseObj
              media = result.media
              episode = result.episode || episode
              failed = result.failed || failed
            } else {
              // cant find ep count or range seems fine
              episode = `${Number(parseObj.episode_number[0])} ~ ${Number(parseObj.episode_number[1])}`
              if (needsVerification) {
                const mediaSearch = (await this.manualMediaSearch(parseObj, media, titleKeys, threshold))
                media = mediaSearch.media
                failed = mediaSearch.failed
              }
            }
          }
        } else {
          let offset = 0
          // media is missing! Likely a horribly named title for a sequel... try fetching the root.
          if (needsVerification) {
            debug(`Media failed to resolve, attempting to fetch root media for ${parseObj.anime_title}`)
            const parseNew = await this.findAndCacheTitle(parseObj.anime_title.replace(/S\d+(E\d+)?/, ''))
            media = this.animeNameCache[this.getCacheKeyForTitle(parseNew[0])]
            maxep = media?.nextAiringEpisode?.episode || media?.episodes
            offset = (-(media?.episodes || media?.nextAiringEpisode?.episode)) || 0
          }
          if ((maxep && parseInt(parseObj.episode_number) > maxep) || (offset !== 0 && maxep && parseInt(parseObj.episode_number) <= maxep)) {
            const result = await this.findResult(parseObj, maxep, offset, media, titleKeys, threshold)
            parseObj = result.parseObj
            media = result.media
            episode = result.episode || episode
            failed = result.failed || failed
          } else {
            // cant find ep count or episode seems fine
            episode = Number(parseObj.episode_number)
            if (needsVerification) {
              const mediaSearch = (await this.manualMediaSearch(parseObj, media, titleKeys, threshold))
              media = mediaSearch.media
              failed = mediaSearch.failed
            }
          }
        }
      } else if (needsVerification) {
        const mediaSearch = (await this.manualMediaSearch(parseObj, media, titleKeys, threshold))
        media = mediaSearch.media
        failed = mediaSearch.failed
      }
      debug(`${failed || !(media?.title?.userPreferred) ? `Failed to resolve` : `Resolved`} ${parseObj.anime_title} ${parseObj.episode_number} ${episode} ${media?.id}:${media?.title?.userPreferred}`)
      fileAnimes.push({
        episode: episode || parseObj.episode_number,
        ...(!media || media.format !== 'MOVIE' || parseObj?.anime_season ? {season: parseObj?.anime_season ? Number(parseObj.anime_season) : 1} : {}),
        parseObject: parseObj,
        media,
        failed: failed || !(media?.title?.userPreferred)
      })
    }
    return fileAnimes
  }

  /**
   * Resolves and returns the appropriate media and episode details by checking for prequels and handling episode ranges.
   * Attempts to fetch the root media if necessary and verifies against the provided `parseObj` and `media`.
   *
   * @param {Object} parseObj - The parsed object containing details about the anime episode (e.g., title, episode number).
   * @param {number} maxep - The maximum episode number available for the media, used to validate episode range.
   * @param {number} offset - The offset to adjust for episode numbering discrepancies (e.g., for sequels or side stories).
   * @param {Object} media - The media object that contains data about the anime (e.g., title, episodes, format).
   * @param {string[]} titleKeys - The list of title keys to match against when verifying media (e.g., 'title.english', 'title.userPreferred').
   * @param {number} threshold - The threshold value to use when comparing titles for similarity (0 to 1 scale).
   *
   * @returns {Object} An object containing the resolved `parseObj`, `media`, `episode`, and a `failed` flag indicating resolution success or failure.
   */
  async findResult(parseObj, maxep, offset, media, titleKeys, threshold) {
    const prequel = await this.findPrequel(parseObj, offset, media, titleKeys, threshold)
    const defaults = { parseObj, media }
    if (prequel.result.failed) {
      const handleEp = await this.handleEpisode(parseObj, maxep, offset, media, prequel, titleKeys, threshold)
      defaults.parseObj = handleEp.parseObj
      defaults.media = handleEp.media
      prequel.result.ignore = !handleEp.failed
      prequel.result.failed = handleEp.failed
    }
    if (!prequel.result.ignore) {
      if (this.isVerified(prequel.result.rootMedia, parseObj, titleKeys, threshold)) {
        debug(`Found rootMedia for ${parseObj.anime_title}: ${prequel.result.rootMedia?.id}:${prequel.result.rootMedia?.title?.userPreferred} from ${media.id}:${media.title?.userPreferred}`)
        const episode = Array.isArray(parseObj.episode_number) ? `${Number(parseObj.episode_number[0] - (parseObj.episode_number[1] - prequel.result.episode))} ~ ${Number(prequel.result.episode)}` : (prequel.result.episode !== parseObj.episode_number && prequel.result.failed ? parseObj.episode_number : prequel.result.episode)
        const results = {
          parseObj,
          media: prequel.result.rootMedia,
          episode,
          failed: prequel.result.failed || false
        }
        if (results.failed) debug(`Failed to resolve ${parseObj.anime_title} ${parseObj.episode_number} ${media?.title?.userPreferred}`)
        return results
      } else return { parseObj, ...(await this.manualMediaSearch(parseObj, media, titleKeys, threshold)) }
    }
    return defaults
  }

  /**
   * Attempts to resolve the root media for an anime, starting at Season 1 (S1) instead of Season 2 or an OVA,
   * which may be caused by parsing errors or incorrect title usage.
   * This function checks for possible prequels or parent series to correctly identify the root media and adjust episode numbering accordingly.
   * If a season is already specified accurately, it avoids unnecessary prequel resolution.
   *
   * @param {Object} parseObj - The parsed object containing details about the anime episode (e.g., title, episode number).
   * @param {number} offset - The offset to adjust episode numbering (e.g., for sequels or side stories).
   * @param {Object} media - The media object that contains data about the anime (e.g., title, episodes, format).
   * @param {string[]} titleKeys - The list of title keys to match against when verifying media (e.g., 'title.english', 'title.userPreferred').
   * @param {number} threshold - The threshold value to use when comparing titles for similarity (0 to 1 scale).
   *
   * @returns {Object} An object containing the resolved media and episode details, along with an indication of whether a prequel was found.
   */
  async findPrequel(parseObj, offset, media, titleKeys, threshold) {
    const prequel = !parseObj.anime_season && (this.findEdge(media, 'PREQUEL')?.node || ((media.format === 'OVA' || media.format === 'ONA') && this.findEdge(media, 'PARENT')?.node))
    debug(`Prequel ${prequel?.id}:${prequel?.title?.userPreferred}`)
    const root = prequel && (await this.resolveSeason({ media: await this.getAnimeById(prequel.id), force: true, offset })).media
    debug(`Root ${root?.id}:${root?.title?.userPreferred}`)
    // check that anime_title is similar to the resolved media title, if it's not then we likely already are at the root level... resolves issues with niche series like MF GHOST.
    let isRoot = false
    if (!root || (root && !this.isVerified(root, parseObj, titleKeys, threshold))) {
      debug(`Detect incorrect Root for ${parseObj?.anime_title}, assuming the title is already root from ${media.id}:${media.title?.userPreferred}`)
      isRoot = true
    }
    // value bigger than episode count
    return { result: (await this.resolveSeason({ media: (!isRoot ? root : media) || media, episode: parseInt(Array.isArray(parseObj.episode_number) ? parseObj.episode_number[1] : parseObj.episode_number), increment: !parseObj.anime_season && !isRoot ? null : true, offset: !parseObj.anime_season && !isRoot ? 0 : offset })), isRoot, root }
  }

  /**
   * Handles the resolution of an episode, especially in cases where episode numbers are missing, invalid, or require adjustment.
   * Attempts to resolve the correct episode by checking if the episode number is out of range or if the media is part of a sequel.
   * Will fetch a new media or episode resolution if necessary, and uses manual search as a last resort.
   *
   * @param {Object} parseObj - The parsed object containing details about the anime episode (e.g., title, episode number).
   * @param {number} maxep - The maximum episode number available for the media, used to validate episode range.
   * @param {number} offset - The offset to adjust for episode numbering discrepancies (e.g., for sequels or side stories).
   * @param {Object} media - The media object that contains data about the anime (e.g., title, episodes, format).
   * @param {boolean} prequel - The prequel object contains isRoot indicating if the current media is the root (first season or main series), and the root media reference.
   * @param {string[]} titleKeys - The list of title keys to match against when verifying media (e.g., 'title.english', 'title.userPreferred').
   * @param {number} threshold - The threshold value to use when comparing titles for similarity (0 to 1 scale).
   *
   * @returns {Object} An object containing the resolved `media`, `parseObj`, `episode`, and a `failed` flag indicating resolution success or failure.
   */
  async handleEpisode(parseObj, maxep, offset, media, prequel, titleKeys, threshold) {
    debug(`Attempting last ditch effort for failed result ${parseObj.anime_title}: ${media?.id}:${media?.title?.userPreferred}.`)
    const episodeNumber = Array.isArray(parseObj.episode_number) ? parseObj.episode_number[1] : parseObj.episode_number
    if (parseObj.anime_season) {
      const result = await this.resolveSeason({ media: (!prequel.isRoot ? prequel.root : media) || media, episode: parseInt(episodeNumber), offset })
      if (!result.failed) return { ...result, parseObj }
    }
    if ((episodeNumber > maxep) || (episodeNumber < 0)) {
      debug(`Detected that the episode number ${episodeNumber} is ${(episodeNumber > maxep) ? `greater than the expect max ${maxep} episode(s)` : `is a negative number`} assuming the actual episode number is in the title for [${parseObj.anime_title}]...`)
      const parseNew = await this.findAndCacheTitle(parseObj.anime_title.replace(/S\d+(E\d+)?/, ''))
      const probeMedia = this.animeNameCache[this.getCacheKeyForTitle(parseNew[0])]
      if ((parseNew[0]?.episode_number < maxep) && probeMedia && this.isVerified(probeMedia, parseNew[0], titleKeys, threshold)) {
        debug(`Found media and proper episode for ${parseObj.anime_title}: ${probeMedia?.id}:${probeMedia?.title?.userPreferred}:E${parseNew[0]?.episode}, the episode title was likely being weird by starting with a numerical value.`)
        return { media: probeMedia, parseObj: parseNew[0], episode: Number(parseNew[0]?.episode_number) }
      }
    }
    return { ...(await this.manualMediaSearch(parseObj, media, titleKeys, threshold)), parseObj }
  }

  /**
   * Attempts to find alternate media titles through a manual search to resolve issues with episode numbers or media matching.
   * This is typically a last-ditch effort when automatic resolution fails, often resolving issues such as incorrect episode counts
   * or mismatched titles (e.g., for series like Misfit of a Demon King).
   *
   * @param {Object} parseObj - The parsed object containing details about the anime episode (e.g., title, episode number).
   * @param {Object} media - The media object that contains data about the anime (e.g., title, episodes, format).
   * @param {string[]} titleKeys - The list of title keys to match against when verifying media (e.g., 'title.english', 'title.userPreferred').
   * @param {number} threshold - The threshold value to use when comparing titles for similarity (0 to 1 scale).
   *
   * @returns {Object} An object containing the resolved `media` object, and a `failed` flag indicating whether the manual search was successful.
   */
  async manualMediaSearch(parseObj, media, titleKeys, threshold) {
    debug(`Attempting final attempt to manual search for failed result ${parseObj.anime_title}: ${media?.id}:${media?.title?.userPreferred}.`)
    const titles = new Set()
    const multiTitleMatch = parseObj.anime_title.match(/^(.+?)\s*\((.+?)\)$/)
    if (multiTitleMatch) {
      titles.add(multiTitleMatch[1].trim())
      titles.add(multiTitleMatch[2].trim())
    }
    titles.add(parseObj.anime_title)
    for (const title of titles) {
      const search = await anilistClient.search({ search: title, ...(media ? { id_not: media.id } : {}), ...(parseObj.anime_season ? { format_not: ['OVA', ...((Number(parseObj.anime_season) > 1) ? ['MOVIE'] : [])] } : { }) })
      if (search.data.Page.media) {
        for (const searchMedia of search.data.Page.media) {
          if (this.isVerified(searchMedia, {...parseObj, anime_title: title}, titleKeys, threshold)) {
            debug(`Found media from manual search for ${parseObj.anime_title}: ${searchMedia?.id}:${searchMedia?.title?.userPreferred} while ignoring the original compound ${media?.id}:${media?.title?.userPreferred}, this is likely correct...`)
            if (parseObj.anime_season) return { media: await this.resolveBySeason(searchMedia, parseObj) }
            else return { media: searchMedia }
          }
        }
      }
    }
    return { media, failed: true }
  }

  /**
   * @param {import('./al.js').Media} media
   * @param {string} type
   * @param {string[]} [formats]
   * @param {boolean} [skip]
   */
  findEdge (media, type, formats = ['TV', 'TV_SHORT'], skip) {
    let res = media.relations.edges.find(edge => {
      if (edge.relationType === type) {
        return formats.includes(edge.node.format)
      }
      return false
    })
    // this is hit-miss
    if (!res && !skip && type === 'SEQUEL') res = this.findEdge(media, type, formats = ['TV', 'TV_SHORT', 'OVA'], true)
    return res
  }

  // note: this doesn't cover anime which uses partially relative and partially absolute episode number, BUT IT COULD!
  /**
   * @param {{ media: import('./al.js').Media , episode?:number, force?:boolean, increment?:boolean, offset?: number, rootMedia?: import('./al.js').Media }} opts
   * @returns {Promise<{ media: import('./al.js').Media, episode: number, offset: number, increment: boolean, rootMedia: import('./al.js').Media, failed?: boolean }>}
   */
  async resolveSeason (opts) {
    // media, episode, increment, offset, force
    if (!opts.media || !(opts.episode || opts.force)) throw new Error('No episode or media for season resolve!')

    let { media, episode, increment, offset = 0, rootMedia = opts.media, force } = opts

    const rootHighest = (rootMedia.nextAiringEpisode?.episode || rootMedia.episodes)

    const prequel = !increment && this.findEdge(media, 'PREQUEL')?.node
    const sequel = !prequel && (increment || increment == null) && this.findEdge(media, 'SEQUEL')?.node
    const edge = prequel || sequel
    increment = increment ?? !prequel

    if (!edge) {
      const obj = { media, episode: episode - offset, offset, increment, rootMedia, failed: true }
      if (!force) debug(`Failed to resolve season ${media.id}:${media.title.userPreferred} ${episode} ${increment} ${offset} ${rootMedia.id}:${rootMedia.title.userPreferred}`)
      return obj
    }
    media = await this.getAnimeById(edge.id)

    const highest = media.nextAiringEpisode?.episode || media.episodes

    const diff = episode - (highest + offset)
    offset += increment ? rootHighest : highest
    if (increment) rootMedia = media

    // force marches till end of tree, no need for checks
    if (!force && diff <= rootHighest) {
      episode -= offset
      return { media, episode, offset, increment, rootMedia }
    }

    return this.resolveSeason({ media, episode, increment, offset, rootMedia, force })
  }

  /**
   * Attempts to get the ROOT of a series, then fetches the prequels until the desired anime season is reached.
   * This isn't great but there really isn't any other options to do this without eating up our limited queries, the manual search is a last resort so this shouldn't happen regularly.
   *
   * @param media - The current media that is being handled.
   * @param parseObj - The parsed object containing details about the anime episode (e.g., title, episode number).
   * @param sequelNumber - How far from root we are.
   * @param root - If we are calculating FROM root.
   * @returns {Promise<{media: import('./al.js').Media}>}
   */
  async resolveBySeason(media, parseObj, sequelNumber = 0, root = false) {
    if (!parseObj?.anime_season) return media
    if (root) {
      const sequel = this.findEdge(media, 'SEQUEL')?.node
      return sequel && (Number(parseObj.anime_season) !== sequelNumber) ? await this.resolveBySeason(await this.getAnimeById(sequel.id), parseObj, sequelNumber + 1, true) : media
    } else {
      const prequel = this.findEdge(media, 'PREQUEL')?.node
      return prequel ? await this.resolveBySeason(await this.getAnimeById(prequel.id), parseObj, 0, false) : await this.resolveBySeason(media, parseObj, 1, true)
    }
  }
}()
