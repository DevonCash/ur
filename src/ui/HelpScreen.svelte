<script lang="ts">
  import Modal from './Modal.svelte';
</script>

<Modal title="How to play">
  <h3>Controls</h3>
  <ul>
    <li>Drag to pan, wheel or pinch to zoom.</li>
    <li>Click a unit or settlement to select it. With a unit selected, click (or right-click) a tile to move or attack.</li>
    <li>With a settlement selected, click a territory tile to lock it as worked; click an enemy in range to shoot (Town+ with Walls).</li>
    <li>Keys: <b>E</b> end turn · <b>N</b> next unit · <b>F</b> fortify · <b>S</b> sleep · <b>Space</b> skip · <b>B</b> found camp · <b>Esc</b> deselect.</li>
  </ul>
  <h3>People are the resource</h3>
  <ul>
    <li>Each person eats 3 food and works 2 tiles. Every unit takes a person and a recruit from its settlement, and eats 1 food there.</li>
    <li>Settlements become Village (3), Town (6) and City (10) by holding that many people for 8 turns. Garrisoned soldiers count.</li>
    <li>Reach follows travel cost: plains and roads reach far, hills and marsh less.</li>
    <li>Projects (mines, roads…) take a person off the fields while they run. Worked flat land becomes farms on its own.</li>
    <li>People drift toward better-run settlements, across borders too. Close borders or restrict emigration to stop them — at a cost.</li>
    <li>Melee kills take prisoners: ransom, release, or settle them after 10 turns.</li>
    <li>Encircle an enemy settlement to besiege it: it works only urban tiles and starves.</li>
    <li>Win by holding every original capital, or by score at turn 150.</li>
  </ul>
</Modal>

<style>
  ul {
    margin: 0 0 12px;
    padding-left: 18px;
  }
  li {
    margin: 3px 0;
  }
</style>
