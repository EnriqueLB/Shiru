<script context='module'>
  import Debug from 'debug'
  const debug = Debug('ui:extensions-view')

  let availableSources = getSources()
  window.addEventListener('online', () => availableSources = getSources())
  async function getSources() {
    try {
      const sources = await (await fetch(atob('aHR0cHM6Ly9lc20uc2gvZ2gvUm9ja2luQ2hhb3MvU2hpcnUtRXh0ZW5zaW9ucy9pbmRleC5qc29u'))).json()
      return Array.isArray(sources) ? sources.reduce((acc, source) => {
        if (source.main) acc.push(source.main)
        return acc
      }, []) : []
    } catch (error) {
      debug('Failed to load available sources', error)
      return []
    }
  }
</script>

<script>
  import { click } from '@/modules/click.js'
  import SettingCard from '@/views/Settings/SettingCard.svelte'
  import { stringToHex, capitalize, toFlags } from '@/modules/util.js'
  import { extensionManager } from '@/modules/extensions/manager.js'
  import { TriangleAlert, Github, Folder, FileQuestion, Trash2, CircleX, ChevronDown, ChevronUp, SquarePlus, Adult } from 'lucide-svelte'
  export let settings

  $: mainTab = true
  $: viewSources = false
  $: pendingSource = false
  $: failedSource = null

  let sourceUrl = ''
  async function addSource(source, trusted = false) {
    if (!source?.length && !sourceUrl?.length) return
    pendingSource = true
    failedSource = await extensionManager.addSource(source || sourceUrl, trusted)
    sourceUrl = ''
    pendingSource = false
  }

  async function removeSource(sourceUrl) {
    pendingSource = true
    await extensionManager.removeSource(sourceUrl)
    pendingSource = false
  }
</script>

<h4 class='mb-10 font-weight-bold'>Content Settings</h4>
<SettingCard title='Auto-Select Torrents' description='Automatically selects torrents based on quality and amount of seeders. Disable this to have more precise control over played torrents.'>
  <div class='custom-switch'>
    <input type='checkbox' id='rss-autoplay' bind:checked={settings.rssAutoplay} />
    <label for='rss-autoplay'>{settings.rssAutoplay ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
<SettingCard title='Filter by providers' description='Automatically selects torrents based on providers. (Expression Regular)'>
  <input type='text' class='form-control w-150 mw-full bg-dark text-truncate' placeholder='(Erai-raws|Judas)' autocomplete='off' bind:value={settings.provider} />
</SettingCard>
<SettingCard title='Auto-Select Files' description='Automatically selects the requested file when clicking the desired episode if it already exists in the batch or if you already have the torrent file before prompting the torrent selection. With this setting enabled you may get unexpected results if the video file(s) fail to determine what media is playing. Disable this to always be prompted to select a torrent regardless of what you already downloaded or is in the current batch. '>
  <div class='custom-switch'>
    <input type='checkbox' id='rss-autofile' bind:checked={settings.rssAutofile} />
    <label for='rss-autofile'>{settings.rssAutofile ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
<SettingCard title='Torrent Quality' description="What quality to use when trying to find torrents. None might rarely find less results than specific qualities. This doesn't exclude other qualities from being found like 4K or weird DVD resolutions.">
  <select class='form-control bg-dark mw-150 w-150 text-truncate' bind:value={settings.rssQuality}>
    <option value='1080' selected>1080p</option>
    <option value='720'>720p</option>
    <option value='540'>540p</option>
    <option value='480'>480p</option>
    <option value=''>Any</option>
  </select>
</SettingCard>
<SettingCard title='Torrent Order' description='Sorts the results by the preferred order. The auto-selected torrent will still consider your Preferred Audio setting.'>
  <select class='form-control bg-dark mw-150 w-150 text-truncate' bind:value={settings.torrentSort}>
    <option value='seeders' selected>Seeders</option>
    <option value='smallest' selected>Smallest</option>
    <option value='new' selected>Newest</option>
    <option value='old' selected>Oldest</option>
    <option value='batch' selected>Batch</option>
    <option value='best' selected>Best</option>
  </select>
</SettingCard>
<SettingCard title='Preferred Audio' description='Prioritizes results matching the preferred language, otherwise will default to Japanese. This language will be loaded automatically when the video is loaded.'>
  <select class='form-control bg-dark mw-150 w-150 text-truncate' bind:value={settings.audioLanguage}>
    <option value='eng'>English</option>
    <option value='jpn' selected>Japanese</option>
    <option value='chi'>Chinese</option>
    <option value='por'>Portuguese</option>
    <option value='spa'>Spanish</option>
    <option value='ger'>German</option>
    <option value='pol'>Polish</option>
    <option value='cze'>Czech</option>
    <option value='dan'>Danish</option>
    <option value='gre'>Greek</option>
    <option value='fin'>Finnish</option>
    <option value='fre'>French</option>
    <option value='hun'>Hungarian</option>
    <option value='ita'>Italian</option>
    <option value='kor'>Korean</option>
    <option value='dut'>Dutch</option>
    <option value='nor'>Norwegian</option>
    <option value='rum'>Romanian</option>
    <option value='rus'>Russian</option>
    <option value='slo'>Slovak</option>
    <option value='swe'>Swedish</option>
    <option value='ara'>Arabic</option>
    <option value='idn'>Indonesian</option>
  </select>
</SettingCard>

<h4 class='mb-10 font-weight-bold'>Extension Settings</h4>
<div class='d-flex bg-dark-light rounded-3 p-4 mw-300 mb-20'>
  <button type='button' class='btn w-150 rounded-3 shadow-none border-0 overflow-hidden text-truncate font-scale-16' class:bg-primary={mainTab} class:bg-transparent={!mainTab} use:click={()=> { mainTab = true }}>Extensions</button>
  <button type='button' class='btn w-150 rounded-3 shadow-none border-0 overflow-hidden text-truncate font-scale-16' class:bg-primary={!mainTab} class:bg-transparent={mainTab} use:click={()=> { mainTab = false }}>Sources</button>
</div>
{#if mainTab}
  <div class='wm-1200 w-full'>
    <div class='w-full d-flex flex-column mb-10'>
      {#if !Object.values(settings.sourcesNew)?.length}
        <div class='card m-0 p-15 mb-10 solid-border bg-error'>
          <div class='d-flex'>
            <TriangleAlert size='4.3rem' />
            <div class='ml-10 mb-5 mb-md-0'>
              <div class='font-size-18 font-weight-bold'>No Extensions Found</div>
              <div class='text-muted pre-wrap'>It looks like you haven't added any extension sources, click the <u>Sources</u> tab to get started.</div>
            </div>
          </div>
        </div>
        {:else}
        {#each Object.values(settings.sourcesNew) as extension}
          {#if !extension?.nsfw || (settings.adult !== 'none')}
            {@const key = (extension?.locale || (extension?.update + '/')) + extension?.id}
            <div class='card m-0 p-15 mb-10 bg-dark-light border' style='border-color: {stringToHex(extension?.locale || extension?.update)} !important' class:extension-disabled={!settings.extensionsNew[key]?.enabled}>
              <div class='d-flex'>
                {#if extension?.icon}
                  <img class='w-43 h-43' src={(!extension?.icon.startsWith('http') ? 'data:image/png;base64,' : '') + extension?.icon} alt={extension?.name} title={extension?.name}>
                {:else}
                  <FileQuestion size='4.3rem' />
                {/if}
                <div class='ml-10 mb-5 mb-md-0'>
                  <div class='font-size-18 font-weight-bold'>{extension?.name || extension?.id}</div>
                  {#if extension?.description}<div class='text-muted pre-wrap'>{extension?.description}</div>{/if}
                </div>
                {#if settings.extensionsNew[key]}
                  <div class='custom-switch ml-auto mt-5'>
                    <input type='checkbox' id={`extension-${key}`} bind:checked={settings.extensionsNew[key].enabled} />
                    <label for={`extension-${key}`}><br/></label>
                  </div>
                {/if}
              </div>
              <div class='d-flex flex-wrap align-items-end'>
                <span class='badge border-0 bg-light pl-10 pr-10 mt-10 font-scale-16'>{extension?.version}</span>
                {#if extension?.type}<span class='badge border-0 bg-light pl-10 pr-10 ml-10 mt-10 font-scale-16'>{capitalize(extension?.type)}</span>{/if}
                {#if extension?.speed}<span class='badge border-0 bg-light pl-10 pr-10 ml-10 mt-10 font-scale-16'>{capitalize(extension?.speed)} Speed</span>{/if}
                {#if extension?.accuracy}<span class='badge border-0 bg-light pl-10 pr-10 ml-10 mt-10 font-scale-16'>{capitalize(extension?.accuracy)} Accuracy</span>{/if}
                {#if extension?.nsfw}
                  <div class='d-flex align-items-center' title='Query results include adult content'><Adult class='ml-10 mt-10' size='2.2rem' /></div>
                {/if}
                {#each extension?.regions || [] as region}
                  <span class='ml-10 font-twemoji font-size-28 h-30' title='Location: {region}'>{toFlags(region)}</span>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
{:else}
  <div class='alert bg-warn wm-1200 p-10 pl-15 mb-5 d-flex'>
    <TriangleAlert size='1.8rem' />
    <span class='ml-10'>Extensions are sandboxed and should be safe from attacks, but it is not recommended to add <u>unknown</u> or <u>untrusted</u> extensions.</span>
  </div>
  {#if failedSource}
    <div class='alert bg-error wm-1200 p-10 pl-15 mb-5 d-flex'>
      <CircleX size='1.8rem' />
      <span class='ml-10'>{failedSource}</span>
    </div>
  {/if}
  <div class='input-group wm-1200 mb-20'>
    <input placeholder='https://example.com/index.json, gh:user/repo, or npm:package_name' type='url' class='form-control bg-dark-light mw-full rounded-2 h-43 border text-truncate' disabled={pendingSource} class:cursor-wait={pendingSource} bind:value={sourceUrl} />
    <button class='ml-10 btn btn-primary d-flex align-items-center justify-content-center rounded-2 w-200 h-43 font-scale-16' disabled={pendingSource || !sourceUrl?.length} class:cursor-wait={pendingSource} type='button' use:click={() => addSource()}><SquarePlus class='mr-10' size='1.8rem' /><span>Add Source</span></button>
  </div>
  <div class='wm-1200'>
    {#if Object.values(settings.sourcesNew)?.length}
      {#each Object.entries(Object.values(settings.sourcesNew).reduce((a, { update, locale }) => { if (!a[update]) a[update] = { count: 0, locale }; a[update].count += 1; return a }, {})).map(([host, { count, locale }]) => ({ host, count, locale })) as extension}
        <div class='d-flex align-items-center bg-dark-light border rounded-2 p-10 mb-10' style='border-color: {stringToHex(extension?.locale || extension?.host)} !important'>
          <div class='d-flex align-items-center ml-10'>
            {#if extension?.locale}
              <Folder size='2.2rem' />
            {:else if extension?.host?.startsWith('gh:')}
              <Github size='2.2rem' />
            {:else if extension?.host?.startsWith('npm:')}
              <img class='rounded sourceIcon' src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcBAMAAACAI8KnAAAALVBMVEXLAADKAADMERHVSkrURkb////eeXnghITfgIDstrbFAADJAADhiorPJCTVSUliGH6+AAAAUklEQVR4AWMgETAKQoEAmKvsAgVGYEnTUCgIFmBgYmAQgOtiAHERACdXSNkBmevi/AGZyxrwAU3v4OJ+gLACGP7DA8dZgOGeixEi6ECUAIlhDgBoOA7wXH0RDQAAAABJRU5ErkJggg==' alt='NPM' title='NPM'/>
            {:else}
              <FileQuestion size='2.2rem' />
            {/if}
          </div>
          <span class='font-weight-semi-bold ml-10 overflow-hidden text-truncate mr-5 font-scale-18'>{extension.host.replace(/^[^:]+:/, '')}</span>
          <span class='font-weight-semi-bold ml-auto text-muted text-nowrap text-truncate'>{extension.count} Extensions</span>
          <button type='button' use:click={() => removeSource(extension.host)} class='btn btn-square d-flex align-items-center justify-content-center ml-10 bg-transparent shadow-none border-0' title='Remove Source' style='color: var(--accent-color)' disabled={pendingSource} class:cursor-wait={pendingSource}><Trash2 size='1.8rem' /></button>
        </div>
      {/each}
    {/if}
  </div>
  {#await availableSources then sources}
    {#if sources?.length && sources.filter(source => !Object.values(settings.sourcesNew)?.some(existing => existing.update === source))?.length}
      <div class='wm-1200'>
        <button type='button' class='btn w-full h-full p-5 rounded-2 d-flex align-items-center' class:bg-dark-light={!viewSources} class:bg-primary={viewSources} use:click={()=> { viewSources = !viewSources }}>
          <span class='ml-10 text-truncate'>{sources.filter(source => !Object.values(settings.sourcesNew)?.some(existing => existing.update === source))?.length} Available Sources</span>
          <svelte:component this={ viewSources ? ChevronUp : ChevronDown } class='ml-auto mr-10' size='2.2rem' />
        </button>
      </div>
      {#if viewSources}
        {@const missingSources = sources.filter(source => !Object.values(settings.sourcesNew)?.some(existing => existing.update === source))}
        <div class='wm-1200 mt-5'>
          {#each missingSources as source, i}
            <div class='d-flex align-items-center bg-dark-light border rounded-2 p-10 mb-10'>
              <div class='d-flex align-items-center ml-10'>
                <Github size='2.2rem' />
              </div>
              <span class='font-weight-semi-bold ml-10 font-scale-18'>{source.startsWith('gh:') ? source.slice(3) : source}</span>
              <button type='button' use:click={() => { addSource(source, true); if (missingSources.length <= 1) viewSources = !viewSources }} class='btn btn-square d-flex align-items-center justify-content-center ml-10 bg-transparent shadow-none border-0 ml-auto' title='Add Source' style='color: var(--success-color-subtle)' disabled={pendingSource} class:cursor-wait={pendingSource}><SquarePlus size='1.8rem' /></button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/await}
{/if}

<style>
  .font-size-28 {
    font-size: 2.8rem;
  }
  .w-43 {
    width: 4.3rem;
  }
  .h-43 {
    height: 4.3rem;
  }
  .mw-300 {
    max-width: 30rem;
  }
  .sourceIcon {
    width: 2.2rem;
    height: 2.2rem;
  }
  .extension-disabled {
    opacity: .4;
  }
  .solid-border {
    border: .1rem solid;
  }
  .alert {
    border: 0;
    border-left: .8rem solid;
    border-radius: .3rem;
  }
</style>