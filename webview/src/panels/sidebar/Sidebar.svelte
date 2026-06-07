<script lang="ts">
  import { onMount } from 'svelte';
  import { repoState, requestRepoState, selectRepo } from '$shared/repoStore';

  import FileTree from './components/FileTree.svelte';
  import RepoGroup from './components/RepoGroup.svelte';

  // Multi-repo: the sidebar shows every repo as its own collapsible group
  // (header + changes + commit area), VS Code's native SCM layout. Reading and
  // committing in a group is scoped to that repo (RepoGroup); focusing a group
  // sets the active repo, which the main panel (log/branches) then follows.

  let ready = false;

  onMount(() => {
    requestRepoState().then(() => (ready = true));
    document.addEventListener('contextmenu', (e) => e.preventDefault(), true);
  });

  // A non-empty push also means we're ready (covers repo.list being unavailable).
  $: if ($repoState.repos.length > 0) ready = true;

  // Focusing a group makes it the active repo → main panel follows it.
  const handleFocus = (rootPath: string) => selectRepo(rootPath);
</script>

{#if ready && $repoState.repos.length === 0}
  <!-- No git repo / no workspace — keep the existing empty state + open/clone CTA. -->
  <FileTree
    files={[]}
    loading={false}
    noRepo={true}
    stagedPaths={new Set()}
    collapsed={new Set()}
  />
{:else}
  <div class="repo-list">
    {#each $repoState.repos as repo (repo.rootPath)}
      <RepoGroup
        {repo}
        focused={repo.rootPath === $repoState.active}
        showHeader={$repoState.repos.length > 1}
        onFocus={handleFocus}
      />
    {/each}
  </div>
{/if}

<style>
  .repo-list {
    display: flex;
    flex-direction: column;
  }
</style>
