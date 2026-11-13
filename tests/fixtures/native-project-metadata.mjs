// Read-only herdr-app ls / hc ls observations (2026-11-13), projected onto
// ~/.config/herdr-app/herdr.d.ts AgentInfo/SpaceInfo and terminals() contracts.
// Only identity/project fields: no argv, prompts, reports or terminal content.
// AgentInfo fields and herdr.space labels are contract projections, not a live
// agents()/terminals() dump; statuses are stabilized for tests.
// Space names intentionally differ from startup folders (including remote t2).
const program = { key: 'pi', name: 'Pi', agent: true, shell: false };
export const nativeProjects = {
  spaces: [
    { id: 'spd34848004a717d97bb767248bffa3020', name: 'herdr-aquarium-theme', folder: '/Users/me/repos/nix-config', machine: null },
    { id: 'sp16dcf2f117bc14b1946d6455a8a2e206', name: 'piano-trainer-next', folder: '/Users/me', machine: null },
    { id: 'nixos/sp26b4f1b606801c5d9d472a4005f16432', name: 'proxmox-image', folder: '', machine: 'nixos' },
  ],
  agents: [
    { address: 't2', pane: 'paa688472b8b88a4b3dc9ad2c8907e14d', space: 'spd34848004a717d97bb767248bffa3020',
      space_name: 'herdr-aquarium-theme', tab: 'tb9252142a79958339c2eeaef5ee6455f1', tab_name: '1', title: 'Pi', status: 'idle', program },
    { address: 't4j', pane: 'paa84a251099a2e022ea74a1eff6e5b5f', space: 'sp16dcf2f117bc14b1946d6455a8a2e206',
      space_name: 'piano-trainer-next', tab: 'tb4c55cf823f215ae7c6052f2f82589874', tab_name: '1', title: 'Pi', status: 'idle', program },
    { address: 'nixos/t2', pane: 'nixos/pa1779203f00aa5c5235cdb19f55a354d', space: 'nixos/sp26b4f1b606801c5d9d472a4005f16432',
      space_name: 'proxmox-image', tab: 'nixos/tbcc7a511e075348d9146b11b6a74c385c', tab_name: '1', title: 'Pi', status: 'idle', program },
  ],
  terminals: [
    { address: 't2', cwd: '/Users/me/repos/herdr-aquarium-theme', labels: { 'herdr.space': 'spd34848004a717d97bb767248bffa3020' } },
    { address: 't4j', cwd: '/Users/me', labels: { 'herdr.space': 'sp16dcf2f117bc14b1946d6455a8a2e206' } },
    { address: 'nixos/t2', cwd: '/home/me/nix-config', labels: { 'herdr.space': 'sp26b4f1b606801c5d9d472a4005f16432' } },
    { address: 't6s', parent: 't2', cwd: '/Users/me/repos/herdr-aquarium-theme', labels: {}, state: 'live', status: 'working', program },
    { address: 't6r', parent: 't4j', cwd: '/Users/me/repos/personal/piano-trainer-next', labels: {}, state: 'live', status: 'working', program },
  ],
};
