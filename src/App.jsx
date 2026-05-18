import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Square, GitBranch, Clock, Target, Layers,
  MessageCircle, Film, Zap, Gift, Database,
  Download, Save, Trash2, Plus, X, ChevronDown, FileCode, Crosshair
} from 'lucide-react';

// =========================================================
//  ACTOR CATALOG (Mock — UE5 실제 연동 전까지 사용)
//  "전투 중 행방불명" 퀘스트용 액터
// =========================================================
const ACTOR_CATALOG = [
  { guid: 'j7a1-buried-board',   name: 'BP_NoticeBoard_Buried_C_1',      type: 'Interactable', level: 'Village',    tags: ['Object.Board'] },
  { guid: 'k8b2-buried-dune',    name: 'BP_NPC_Dune_C_3',                 type: 'NPC',          level: 'Village',    tags: ['NPC.Dune'] },
  { guid: 'l9c3-buried-hut',     name: 'BP_BoxTrigger_AbandonedHut',      type: 'Trigger',      level: 'Wilderness', tags: ['Area.AbandonedHut'] },
  { guid: 'm1d4-buried-battle',  name: 'BP_BoxTrigger_Battlefield',       type: 'Trigger',      level: 'Wilderness', tags: ['Area.Battlefield'] },
  { guid: 'n2e5-buried-shield',  name: 'BP_Interact_WhiteFlowerShield',   type: 'Interactable', level: 'Wilderness', tags: ['Object.Shield'] },
  { guid: 'o3f6-buried-lake',    name: 'BP_BoxTrigger_LakePath',          type: 'Trigger',      level: 'Wilderness', tags: ['Area.LakePath'] },
  { guid: 'p4a7-buried-hut-int', name: 'BP_BoxTrigger_HutInterior',       type: 'Trigger',      level: 'Wilderness', tags: ['Area.HutInterior'] },
  { guid: 'q5b8-buried-bastian', name: 'BP_NPC_Bastian',                  type: 'NPC',          level: 'Wilderness', tags: ['NPC.Bastian'] },
  { guid: 'r6c9-buried-ryosin',  name: 'BP_NPC_Ryosin',                   type: 'NPC',          level: 'Wilderness', tags: ['NPC.Ryosin'] }
];

const GAMEPLAY_TAGS = [
  'NPC.Dune', 'NPC.Bastian', 'NPC.Ryosin',
  'Monster.Frog', 'Monster.Geowa', 'Monster.Bandit',
  'Object.Board', 'Object.Shield', 'Object.Door',
  'Area.Village', 'Area.AbandonedHut', 'Area.Battlefield',
  'Area.LakePath', 'Area.HutInterior',
  'EntryRoute.Board', 'EntryRoute.Proximity', 'EntryRoute.HutDiscovery'
];

function getActor(guid) {
  return ACTOR_CATALOG.find(a => a.guid === guid);
}

function formatTarget(target) {
  if (!target) return '(미설정)';
  if (target.mode === 'actor') {
    const a = getActor(target.actorGuid);
    if (!a) return target.actorGuid ? '(없어진 레퍼런스)' : '(미설정)';
    return a.name;
  }
  if (target.mode === 'tag') return target.tag || '(태그 미설정)';
  return '(미설정)';
}

// =========================================================
//  NODE TYPE REGISTRY  (11개: QuestLink 제거)
// =========================================================
const NODE_TYPES = {
  Start: {
    category: 'flow', label: 'Start', icon: Play,
    desc: '퀘스트 진입점', inPins: 0, outPins: 1,
    defaults: {
      trigger_type: 'on_interact',
      target: { mode: 'actor', actorGuid: null, tag: null },
      distance_m: 5,
      target_quest: '', required_ending: '',
      is_auto_accept: false, entry_route_tag: '',
      priority: 0, is_tracked: true
    }
  },
  End: {
    category: 'flow', label: 'End', icon: Square,
    desc: '퀘스트 종료점', inPins: 1, outPins: 0,
    defaults: { ending_tag: 'A', ending_title: '', on_end_effects: [] }
  },
  Check: {
    // 구 Condition — 다른 퀘스트 발동은 Effect의 set_flag + Start on_fact 조합으로 처리
    category: 'flow', label: 'Check', icon: GitBranch,
    desc: '자연어 조건 분기', inPins: 1, outPins: 2,
    defaults: {
      question_type: 'killed',
      target: { mode: 'tag', actorGuid: null, tag: null },
      count: 1, comparator: 'gte',
      item_id: '', quest_id: '', ending_tag: '',
      fact_key: '', operator: '==', compare_value: '',
      description: ''
    }
  },
  Wait: {
    category: 'flow', label: 'Wait', icon: Clock,
    desc: '시간 지연 / Fact 감시', inPins: 1, outPins: 1,
    defaults: { wait_type: 'timer', duration_sec: 1.0, watch_fact: '' }
  },
  Phase: {
    category: 'objective', label: 'Phase', icon: Target,
    desc: '플레이어 목표 단계', inPins: 1, outPins: 1,
    defaults: {
      objective_text: '', goal_type: 'kill_count',
      hints: [], alt_completion_facts: [],
      journal_entry: '', is_optional: false,
      target: { mode: 'tag', actorGuid: null, tag: null },
      count: 1, item_id: '',
      targets: [], on_wrong_order: 'reset',
      interaction_type: 'use', prompt_text: '',
      function_id: '', description: ''
    }
  },
  PhaseGroup: {
    category: 'objective', label: 'Phase Group', icon: Layers,
    desc: '병렬/순차 목표 컨테이너', inPins: 1, outPins: 1,
    defaults: { policy: 'ALL', skip_on: null, member_order: [] }
  },
  Dialogue: {
    category: 'content', label: 'Dialogue', icon: MessageCircle,
    desc: 'NPC 대화 트리 재생', inPins: 1, outPins: 1,
    defaults: { scene_asset: '', participants: [], camera_mode: 'over_shoulder', context_facts: [] }
  },
  Cutscene: {
    category: 'content', label: 'Cutscene', icon: Film,
    desc: '컷신 재생', inPins: 1, outPins: 1,
    defaults: { sequence_asset: '', skippable: true, on_skip_fact: '' }
  },
  Action: {
    category: 'system', label: 'Action', icon: Zap,
    desc: '월드 명령 실행', inPins: 1, outPins: 1,
    defaults: {
      action_type: 'npc_state_change',
      target: { mode: 'actor', actorGuid: null, tag: null },
      state_value: '', preset: '', count: 1, remove_on_fail: false,
      enabled: true, weather_preset: 'clear', sound_asset: '',
      function_id: '', description: ''
    }
  },
  Reward: {
    category: 'system', label: 'Reward', icon: Gift,
    desc: '보상 지급', inPins: 1, outPins: 1,
    defaults: { xp: 0, gold: 0, items: [], scale_to_level: true }
  },
  Effect: {
    // 구 FactSet — 다른 퀘스트를 발동해야 하면 set_flag + 해당 퀘스트 Start: trigger_type=on_fact 로 대체
    category: 'system', label: 'Effect', icon: Database,
    desc: '월드 상태 효과 묶음', inPins: 1, outPins: 1,
    defaults: { effects: [] }
  }
};

const CATEGORY_STYLES = {
  flow:      { bg: '#3d2a55', border: '#a78bfa', accent: '#c4b5fd', name: '흐름 제어' },
  objective: { bg: '#0f3d3a', border: '#5eead4', accent: '#99f6e4', name: '목표' },
  content:   { bg: '#4a2018', border: '#fb7185', accent: '#fda4af', name: '콘텐츠' },
  system:    { bg: '#4a3014', border: '#fbbf24', accent: '#fcd34d', name: '시스템' }
};

const FACT_REGISTRY = [];

// =========================================================
//  QUEST: 전투 중 행방불명
// =========================================================
const buildBuriedOnesQuest = () => {
  const gen = (() => { let n = 0; return () => `b${++n}`; })();
  const make = (type, x, y, props = {}) => ({
    id: gen(), type, x, y,
    props: { ...NODE_TYPES[type].defaults, ...props }
  });

  // ── 진입 경로 (3개 Start) ──────────────────────────────
  const n1 = make('Start', 60, 60, {
    trigger_type: 'on_interact',
    target: { mode: 'actor', actorGuid: 'j7a1-buried-board', tag: null },
    is_auto_accept: false, priority: 1,
    entry_route_tag: 'EntryRoute.Board'
  });
  const n2 = make('Start', 280, 60, {
    trigger_type: 'on_proximity',
    target: { mode: 'actor', actorGuid: 'k8b2-buried-dune', tag: null },
    distance_m: 20, is_auto_accept: false, priority: 0,
    entry_route_tag: 'EntryRoute.Proximity'
  });
  const n3 = make('Start', 520, 60, {
    trigger_type: 'on_area_enter',
    target: { mode: 'actor', actorGuid: 'l9c3-buried-hut', tag: null },
    is_auto_accept: true, priority: 0,
    entry_route_tag: 'EntryRoute.HutDiscovery'
  });

  // ── 수락 분기 ──────────────────────────────────────────
  const n4 = make('Dialogue', 60, 210, {
    scene_asset: 'dlg_dune_accept_board',
    participants: [{ mode: 'actor', actorGuid: 'k8b2-buried-dune', tag: null }],
    camera_mode: 'over_shoulder', context_facts: []
  });
  const n5 = make('Dialogue', 280, 210, {
    scene_asset: 'dlg_dune_accept_proximity',
    participants: [{ mode: 'actor', actorGuid: 'k8b2-buried-dune', tag: null }],
    camera_mode: 'over_shoulder', context_facts: []
  });
  const n6 = make('Phase', 520, 210, {
    objective_text: '마을에 있는 뒤과 대화',
    goal_type: 'interact',
    target: { mode: 'actor', actorGuid: 'k8b2-buried-dune', tag: null },
    interaction_type: 'talk',
    hints: ['뒤은 마을 어귀에 있음']
  });

  // ── 고정 루트 1 (SEQUENCE + Skip) ─────────────────────
  const n7 = make('PhaseGroup', 180, 370, {
    policy: 'SEQUENCE',
    skip_on: {
      question_type: 'visited',
      target: { mode: 'actor', actorGuid: 'p4a7-buried-hut-int', tag: null },
      count: 1, comparator: 'gte',
      item_id: '', quest_id: '', ending_tag: '',
      fact_key: '', operator: '==', compare_value: ''
    }
  });
  const n8 = make('Phase', 220, 415, {
    objective_text: '시체들이 가득한 전장 도착',
    goal_type: 'area_reach',
    target: { mode: 'actor', actorGuid: 'm1d4-buried-battle', tag: null },
    hints: ['전장은 마을 북쪽에 있음']
  });
  const n9 = make('Phase', 220, 510, {
    objective_text: '워쳐 렌즈로 흰색 꽃이 그려진 방패 조사',
    goal_type: 'interact',
    target: { mode: 'actor', actorGuid: 'n2e5-buried-shield', tag: null },
    interaction_type: 'examine',
    hints: ['워쳐 렌즈(L2)로 단서 파악', '방패는 시체 근처에 떨어져 있음']
  });
  const n10 = make('Phase', 220, 605, {
    objective_text: '뒤과 함께 호수길을 따라가기',
    goal_type: 'area_reach',
    target: { mode: 'actor', actorGuid: 'o3f6-buried-lake', tag: null },
    hints: ['뒤이 앞장서서 길을 안내']
  });
  const n11 = make('Phase', 220, 700, {
    objective_text: '버려진 오두막에서 박스티안과 룬신 만나기',
    goal_type: 'area_reach',
    target: { mode: 'actor', actorGuid: 'p4a7-buried-hut-int', tag: null },
    hints: ['오두막은 호수 남쪽 끝에 있음']
  });

  // ── 고정 루트 2 ────────────────────────────────────────
  const n12 = make('Phase', 420, 840, {
    objective_text: '뒤과 대화하고 룬신의 처치를 결정하기',
    goal_type: 'interact',
    target: { mode: 'actor', actorGuid: 'k8b2-buried-dune', tag: null },
    interaction_type: 'talk',
    hints: ['뒤이 결정을 기다리고 있음']
  });
  const n13 = make('Dialogue', 420, 960, {
    scene_asset: 'dlg_decide_ryosin_fate',
    participants: [
      { mode: 'actor', actorGuid: 'k8b2-buried-dune', tag: null },
      { mode: 'actor', actorGuid: 'r6c9-buried-ryosin', tag: null }
    ],
    camera_mode: 'over_shoulder', context_facts: []
  });

  // ── 결말 분기 ──────────────────────────────────────────
  const n14 = make('Effect', 240, 1090, {
    effects: [{ effect_type: 'set_quest_ending', quest_id: 'buried_ones', ending_tag: 'A' }]
  });
  const n15 = make('End', 240, 1210, {
    ending_tag: 'A', ending_title: '룬신을 내보내고 떠난다', on_end_effects: []
  });
  const n16 = make('Effect', 600, 1090, {
    effects: [{ effect_type: 'set_quest_ending', quest_id: 'buried_ones', ending_tag: 'B' }]
  });
  const n17 = make('End', 600, 1210, {
    ending_tag: 'B', ending_title: '룬신을 집으로 데려간다', on_end_effects: []
  });

  const nodes = [n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14, n15, n16, n17];

  const edges = [
    { from: n1.id, fromPin: 0, to: n4.id,  toPin: 0 },
    { from: n2.id, fromPin: 0, to: n5.id,  toPin: 0 },
    { from: n3.id, fromPin: 0, to: n6.id,  toPin: 0 },
    { from: n4.id, fromPin: 0, to: n7.id,  toPin: 0 },
    { from: n5.id, fromPin: 0, to: n7.id,  toPin: 0 },
    { from: n7.id, fromPin: 0, to: n12.id, toPin: 0 }, // OUT
    { from: n7.id, fromPin: 1, to: n12.id, toPin: 0 }, // SKIP
    { from: n6.id, fromPin: 0, to: n12.id, toPin: 0 }, // 경로C 합류
    { from: n12.id, fromPin: 0, to: n13.id, toPin: 0 },
    { from: n13.id, fromPin: 0, to: n14.id, toPin: 0 },
    { from: n13.id, fromPin: 0, to: n16.id, toPin: 0 },
    { from: n14.id, fromPin: 0, to: n15.id, toPin: 0 },
    { from: n16.id, fromPin: 0, to: n17.id, toPin: 0 }
  ];

  const groups = [
    { id: 'g_fixed_route_1', groupNodeId: n7.id, memberIds: [n8.id, n9.id, n10.id, n11.id] }
  ];

  return { nodes, edges, groups };
};

// =========================================================
//  QUEST REGISTRY — 상단 드롭다운에서 선택
// =========================================================
const QUESTS = [
  {
    id: 'buried_ones',
    label: '전투 중 행방불명',
    filename: 'quest_buried_ones.qgraph',
    subtitle: '뒤과 함께 버려진 오두막에 도착해 룬신의 처치를 결정한다.',
    build: buildBuriedOnesQuest
  }
];

// =========================================================
//  NODE BODY TEXT
// =========================================================
const NODE_W = 168;
const NODE_H = 88;

function nodeBodyText(node, memberCount) {
  const p = node.props;
  switch (node.type) {
    case 'Start': {
      let text = '';
      switch (p.trigger_type) {
        case 'on_interact':   text = `상호작용: ${formatTarget(p.target)}`; break;
        case 'on_proximity':  text = `근접 ${p.distance_m}m: ${formatTarget(p.target)}`; break;
        case 'on_area_enter': text = `영역 진입: ${formatTarget(p.target)}`; break;
        case 'on_quest_state':text = `퀘스트 ${p.target_quest || '?'} = ${p.required_ending || '?'}`; break;
        default:              text = '(트리거 미설정)';
      }
      if (p.is_auto_accept) text += ' · auto';
      return text;
    }
    case 'End': return p.ending_title ? `결말 ${p.ending_tag} · ${p.ending_title}` : `결말 ${p.ending_tag}`;
    case 'Check': {
      const tgt = formatTarget(p.target);
      switch (p.question_type) {
        case 'killed':
          return p.target?.mode === 'tag'
            ? `처치: ${p.target?.tag || '?'} ≥ ${p.count}`
            : `처치: ${tgt}`;
        case 'has_item':    return `보유: ${p.item_id || '?'} ≥ ${p.count}`;
        case 'talked':      return `대화: ${tgt}`;
        case 'visited':     return `방문: ${tgt}`;
        case 'interacted':  return `상호작용: ${tgt}`;
        case 'quest_state': return `퀘스트 ${p.quest_id || '?'} = ${p.ending_tag || '?'}`;
        case 'direct_fact': return p.fact_key ? `${p.fact_key} ${p.operator} ${p.compare_value}` : '(조건 미설정)';
        default: return '(조건 미설정)';
      }
    }
    case 'Wait': return p.wait_type === 'timer' ? `타이머 ${p.duration_sec}초` : `감시: ${p.watch_fact || '?'}`;
    case 'Phase': {
      const tgt = formatTarget(p.target);
      return (
        <>
          <div>{p.objective_text || '(목표 미설정)'}</div>
          {tgt !== '(미설정)' && <div style={{ fontSize: 9.5, color: '#7a7468', marginTop: 2 }}>→ {tgt}</div>}
        </>
      );
    }
    case 'PhaseGroup': {
      const policy = p.policy || 'ALL';
      const cnt = memberCount ?? 0;
      let txt = policy === 'SEQUENCE' ? `SEQUENCE · 멤버 ${cnt}개` : `정책: ${policy}`;
      if (p.skip_on) txt += ' · SKIP';
      return txt;
    }
    case 'Dialogue':  return p.scene_asset || '(대화 에셋 미설정)';
    case 'Cutscene':  return p.sequence_asset || '(컷신 미설정)';
    case 'Action': {
      const needsTgt = ['npc_state_change', 'spawn', 'object_toggle'].includes(p.action_type);
      return needsTgt ? `${p.action_type}: ${formatTarget(p.target)}` : p.action_type;
    }
    case 'Reward': return `XP ${p.xp} · ${p.gold}G${p.items?.length ? ` · ${p.items.length}item` : ''}`;
    case 'Effect': {
      const effs = p.effects || [];
      if (effs.length === 0) return '(효과 없음)';
      if (effs.length === 1) {
        const e = effs[0];
        switch (e.effect_type) {
          case 'set_quest_ending': return `결말: ${e.quest_id || '?'} → ${e.ending_tag || '?'}`;
          case 'set_flag':         return `플래그: ${e.flag_key || '?'} = ${e.flag_value ? 'true' : 'false'}`;
          case 'change_counter':   return `카운터: ${formatTarget(e.counter_target)}`;
          case 'mark_visited':     return `방문 처리: ${formatTarget(e.area_target)}`;
          case 'set_entry_route':  return `진입경로: ${e.route_tag || '?'}`;
          case 'direct_fact':      return e.fact_key ? `${e.fact_key} ${e.operation} ${e.value}` : '(미설정)';
          default: return e.effect_type;
        }
      }
      return `효과 ${effs.length}개 적용`;
    }
    default: return '';
  }
}

// =========================================================
//  NODE VIEW
// =========================================================
function NodeView({ node, selected, onMouseDownNode, onPinMouseDown, onPinMouseUp, onDoubleClick, seqIndex, memberCount }) {
  const def = NODE_TYPES[node.type];
  const style = CATEGORY_STYLES[def.category];
  const Icon = def.icon;
  const hasSkip = node.type === 'PhaseGroup' && node.props?.skip_on;

  return (
    <div
      onMouseDown={(e) => onMouseDownNode(e, node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
      style={{
        position: 'absolute', left: node.x, top: node.y,
        width: NODE_W, minHeight: NODE_H,
        background: `linear-gradient(160deg, ${style.bg} 0%, ${style.bg}dd 100%)`,
        border: `1px solid ${selected ? style.accent : style.border}`,
        borderRadius: 6, color: '#f4f1ea',
        fontFamily: '"IBM Plex Sans KR", "Inter", sans-serif',
        fontSize: 11, cursor: 'move', userSelect: 'none',
        boxShadow: selected
          ? `0 0 0 1px ${style.accent}, 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`
          : `0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
        transition: 'box-shadow 120ms ease'
      }}
    >
      {/* Sequence index badge */}
      {seqIndex !== undefined && (
        <div style={{
          position: 'absolute', left: -18, top: 6,
          width: 16, height: 16, borderRadius: '50%',
          background: style.border, color: '#0f0d0a',
          fontSize: 9, fontWeight: 700,
          fontFamily: '"JetBrains Mono", monospace',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1
        }}>{seqIndex}</div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px',
        borderBottom: `1px solid ${style.border}40`,
        background: `linear-gradient(180deg, ${style.border}22, transparent)`
      }}>
        <Icon size={12} color={style.accent} strokeWidth={2} />
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
          letterSpacing: '0.08em', color: style.accent,
          textTransform: 'uppercase', fontWeight: 600
        }}>{def.label}</span>
      </div>

      <div style={{ padding: '8px 10px 10px', fontSize: 11, color: '#d4cdbf', lineHeight: 1.35 }}>
        {nodeBodyText(node, memberCount)}
      </div>

      {/* IN pin */}
      {def.inPins > 0 && (
        <div
          onMouseUp={(e) => { e.stopPropagation(); onPinMouseUp(node.id, 0, 'in'); }}
          style={{ position: 'absolute', left: -7, top: NODE_H / 2 - 6, width: 13, height: 13, borderRadius: '50%', background: '#1a1814', border: `2px solid ${style.accent}`, cursor: 'crosshair' }}
        />
      )}

      {/* OUT pin (single) */}
      {def.outPins === 1 && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); onPinMouseDown(e, node.id, 0); }}
          style={{ position: 'absolute', right: -7, top: NODE_H / 2 - 6, width: 13, height: 13, borderRadius: '50%', background: '#1a1814', border: `2px solid ${style.accent}`, cursor: 'crosshair' }}
        />
      )}

      {/* OUT pins (T/F for Check) */}
      {def.outPins === 2 && (
        <>
          <div onMouseDown={(e) => { e.stopPropagation(); onPinMouseDown(e, node.id, 0); }}
            style={{ position: 'absolute', right: -7, top: 28, width: 13, height: 13, borderRadius: '50%', background: '#1a1814', border: '2px solid #5eead4', cursor: 'crosshair' }} title="TRUE" />
          <span style={{ position: 'absolute', right: 10, top: 24, fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: '#5eead4' }}>T</span>
          <div onMouseDown={(e) => { e.stopPropagation(); onPinMouseDown(e, node.id, 1); }}
            style={{ position: 'absolute', right: -7, bottom: 14, width: 13, height: 13, borderRadius: '50%', background: '#1a1814', border: '2px solid #fb7185', cursor: 'crosshair' }} title="FALSE" />
          <span style={{ position: 'absolute', right: 10, bottom: 16, fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: '#fb7185' }}>F</span>
        </>
      )}

      {/* PhaseGroup SKIP pin (조건부) */}
      {hasSkip && (
        <>
          <div onMouseDown={(e) => { e.stopPropagation(); onPinMouseDown(e, node.id, 1); }}
            style={{ position: 'absolute', right: -7, bottom: 14, width: 13, height: 13, borderRadius: '50%', background: '#1a1814', border: '2px solid #fbbf24', cursor: 'crosshair' }} title="SKIP" />
          <span style={{ position: 'absolute', right: 8, bottom: 16, fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: '#fbbf24' }}>SKIP</span>
        </>
      )}
    </div>
  );
}

// =========================================================
//  MOCK VIEWPORT — 데모 장치. UE5 연동 시 제거되고 진짜 뷰포트 통신으로 대체됨.
// =========================================================
const ACTOR_TYPE_DOT = { NPC: '🟢', Monster: '🔴', Interactable: '🔵', Trigger: '🟣' };

function MockViewport({ allowedTypes, onSelect, onCancel }) {
  const actors = allowedTypes ? ACTOR_CATALOG.filter(a => allowedTypes.includes(a.type)) : ACTOR_CATALOG;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, cursor: 'crosshair', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 24 }} onClick={onCancel}>
      <div style={{ background: '#1a1814', border: '1px solid #3a342c', borderRadius: 4, width: 290, maxHeight: 340, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2620', fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, letterSpacing: '0.15em', color: '#a89a7a', textTransform: 'uppercase' }}>Mock Level Viewport</div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {actors.map(a => (
            <div key={a.guid} onClick={() => onSelect(a)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 11, color: '#d4cdbf', borderBottom: '1px solid #2a262022', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = '#2a2620'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span>{ACTOR_TYPE_DOT[a.type] || '⚪'}</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, flex: 1 }}>{a.name}</span>
              <span style={{ fontSize: 9, color: '#7a7468' }}>{a.level}</span>
            </div>
          ))}
          {actors.length === 0 && <div style={{ padding: 16, color: '#7a7468', fontSize: 10.5, textAlign: 'center' }}>해당 타입 액터 없음</div>}
        </div>
        <div style={{ padding: '6px 12px', borderTop: '1px solid #2a2620', fontSize: 9.5, color: '#7a7468', fontFamily: '"JetBrains Mono", monospace' }}>[ESC] 스크이더 모드 종료</div>
      </div>
    </div>
  );
}

// =========================================================
//  TARGET PICKER
// =========================================================
function TargetPicker({ value, onChange, allowedTypes, defaultMode = 'actor' }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const currentMode = value?.mode || defaultMode;
  const setMode = (mode) => onChange({ ...(value || {}), mode });
  const filteredActors = ACTOR_CATALOG.filter(a => {
    if (allowedTypes && !allowedTypes.includes(a.type)) return false;
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return a.name.toLowerCase().includes(s) || a.tags.some(t => t.toLowerCase().includes(s));
  });
  const filteredTags = GAMEPLAY_TAGS.filter(t => !searchText || t.toLowerCase().includes(searchText.toLowerCase()));
  const selectedActor = currentMode === 'actor' ? getActor(value?.actorGuid) : null;
  const selectedTag = currentMode === 'tag' ? value?.tag : null;
  const isInvalid = currentMode === 'actor' && value?.actorGuid && !selectedActor;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {['actor', 'tag'].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '3px 9px', fontSize: 9.5, fontFamily: '"JetBrains Mono", monospace',
            background: currentMode === m ? '#2a2620' : 'transparent',
            border: `1px solid ${currentMode === m ? '#a89a7a' : '#2a2620'}`,
            color: currentMode === m ? '#e8e1d0' : '#7a7468',
            borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em'
          }}>{m === 'actor' ? '◉ Actor Reference' : '◉ Gameplay Tag'}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {currentMode === 'actor' && (
          <button onClick={() => setEyedropperActive(true)} title="스크이더 모드"
            style={{ ...iconBtn, padding: '5px 8px', color: eyedropperActive ? '#99f6e4' : '#a89a7a', border: `1px solid ${eyedropperActive ? '#5eead4' : '#3a342c'}` }}>
            <Crosshair size={13} />
          </button>
        )}
        <div style={{ flex: 1, position: 'relative' }}>
          <div onClick={() => { setDropdownOpen(d => !d); setSearchText(''); }}
            style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: isInvalid ? '#fb7185' : (selectedActor || selectedTag ? '#e8e1d0' : '#7a7468'), border: isInvalid ? '1px solid #fb7185' : inputStyle.border }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {isInvalid ? '(없어진 레퍼런스)' : currentMode === 'actor' ? (selectedActor ? selectedActor.name : '(액터를 선택하세요)') : (selectedTag || '(태그를 선택하세요)')}
            </span>
            <ChevronDown size={11} style={{ flexShrink: 0, marginLeft: 4 }} />
          </div>
          {dropdownOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setDropdownOpen(false)} />
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#1a1814', border: '1px solid #3a342c', borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', maxHeight: 220, overflowY: 'auto' }}>
                <input autoFocus style={{ ...inputStyle, borderRadius: 0, borderWidth: '0 0 1px 0', borderColor: '#2a2620' }} placeholder="검색..." value={searchText} onChange={e => setSearchText(e.target.value)} onClick={e => e.stopPropagation()} />
                {currentMode === 'actor' && filteredActors.map(a => (
                  <div key={a.guid} onClick={() => { onChange({ mode: 'actor', actorGuid: a.guid, tag: value?.tag }); setDropdownOpen(false); }}
                    style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 11, color: '#d4cdbf', borderBottom: '1px solid #2a262022', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#2a2620'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5 }}>{a.name}</span>
                    <span style={{ fontSize: 9, color: '#7a7468', flexShrink: 0, marginLeft: 8 }}>{a.level} · {a.type}</span>
                  </div>
                ))}
                {currentMode === 'tag' && filteredTags.map(t => (
                  <div key={t} onClick={() => { onChange({ mode: 'tag', actorGuid: value?.actorGuid, tag: t }); setDropdownOpen(false); }}
                    style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 11, color: '#d4cdbf', fontFamily: '"JetBrains Mono", monospace', borderBottom: '1px solid #2a262022' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#2a2620'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{t}</div>
                ))}
                {((currentMode === 'actor' && filteredActors.length === 0) || (currentMode === 'tag' && filteredTags.length === 0)) && (
                  <div style={{ padding: '10px', color: '#7a7468', fontSize: 10.5, textAlign: 'center' }}>결과 없음</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {selectedActor && <div style={{ fontSize: 9.5, color: '#7a7468', marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>▲ Level: {selectedActor.level} · {selectedActor.type}</div>}
      {currentMode === 'tag' && selectedTag && <div style={{ fontSize: 9.5, color: '#7a7468', marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>Tag</div>}
      {isInvalid && <div style={{ fontSize: 9.5, color: '#fb7185', marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>⚠ 카탈로그에 없는 레퍼런스</div>}
      {eyedropperActive && <MockViewport allowedTypes={allowedTypes} onSelect={(actor) => { onChange({ mode: 'actor', actorGuid: actor.guid, tag: value?.tag }); setEyedropperActive(false); }} onCancel={() => setEyedropperActive(false)} />}
    </div>
  );
}

function TargetPickerList({ value = [], onChange, allowedTypes, defaultMode = 'actor' }) {
  const add = () => onChange([...value, { mode: defaultMode, actorGuid: null, tag: null }]);
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const upd = (i, val) => onChange(value.map((v, idx) => idx === i ? val : v));
  return (
    <div>
      {value.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}><TargetPicker value={v} onChange={val => upd(i, val)} allowedTypes={allowedTypes} defaultMode={defaultMode} /></div>
          <button onClick={() => remove(i)} style={{ ...iconBtn, padding: '5px 7px', marginTop: 1, flexShrink: 0 }}><X size={11} /></button>
        </div>
      ))}
      <button onClick={add} style={{ ...iconBtn, width: '100%', justifyContent: 'center', gap: 6, marginTop: 2, fontSize: 10.5 }}><Plus size={11} /> 추가</button>
    </div>
  );
}

// =========================================================
//  QUESTION BUILDER — Check 노드 및 PhaseGroup skip_on 공용
// =========================================================
const DEFAULT_QUESTION = {
  question_type: 'killed',
  target: { mode: 'tag', actorGuid: null, tag: null },
  count: 1, comparator: 'gte',
  item_id: '', quest_id: '', ending_tag: '',
  fact_key: '', operator: '==', compare_value: '', description: ''
};

function QuestionBuilder({ value, onChange }) {
  const q = { ...DEFAULT_QUESTION, ...(value || {}) };
  const upd = (key, val) => onChange({ ...q, [key]: val });
  return (
    <div>
      <Field label="Question Type">
        <select style={inputStyle} value={q.question_type} onChange={e => upd('question_type', e.target.value)}>
          <option value="killed">처치했는가</option>
          <option value="has_item">보유 중인가</option>
          <option value="talked">대화했는가</option>
          <option value="visited">방문했는가</option>
          <option value="interacted">상호작용했는가</option>
          <option value="quest_state">다른 퀘스트 상태가</option>
          <option disabled>───────────────</option>
          <option value="direct_fact">(고급) Fact 직접 비교</option>
        </select>
      </Field>
      {q.question_type === 'killed' && (
        <>
          <Field label="대상 (Monster / NPC)">
            <TargetPicker value={q.target} onChange={v => upd('target', v)} allowedTypes={['Monster', 'NPC']} defaultMode="tag" />
          </Field>
          {q.target?.mode === 'tag' && (
            <>
              <Field label="수량"><input type="number" style={inputStyle} value={q.count} onChange={e => upd('count', Number(e.target.value))} /></Field>
              <Field label="비교">
                <select style={inputStyle} value={q.comparator} onChange={e => upd('comparator', e.target.value)}>
                  <option value="gte">이상 (≥)</option>
                  <option value="lte">이하 (≤)</option>
                  <option value="eq">정확히 (=)</option>
                </select>
              </Field>
            </>
          )}
        </>
      )}
      {q.question_type === 'has_item' && (
        <>
          <Field label="Item ID"><input style={inputStyle} value={q.item_id} onChange={e => upd('item_id', e.target.value)} /></Field>
          <Field label="수량"><input type="number" style={inputStyle} value={q.count} onChange={e => upd('count', Number(e.target.value))} /></Field>
          <Field label="비교">
            <select style={inputStyle} value={q.comparator} onChange={e => upd('comparator', e.target.value)}>
              <option value="gte">이상 (≥)</option><option value="lte">이하 (≤)</option><option value="eq">정확히 (=)</option>
            </select>
          </Field>
        </>
      )}
      {q.question_type === 'talked' && <Field label="NPC"><TargetPicker value={q.target} onChange={v => upd('target', v)} allowedTypes={['NPC']} defaultMode="actor" /></Field>}
      {q.question_type === 'visited' && <Field label="트리거 영역"><TargetPicker value={q.target} onChange={v => upd('target', v)} allowedTypes={['Trigger']} defaultMode="actor" /></Field>}
      {q.question_type === 'interacted' && <Field label="대상 (Interactable)"><TargetPicker value={q.target} onChange={v => upd('target', v)} allowedTypes={['Interactable']} defaultMode="actor" /></Field>}
      {q.question_type === 'quest_state' && (
        <>
          <Field label="Quest ID"><input style={inputStyle} value={q.quest_id} onChange={e => upd('quest_id', e.target.value)} placeholder="예: rainbow_lake" /></Field>
          <Field label="Ending Tag"><input style={inputStyle} value={q.ending_tag} onChange={e => upd('ending_tag', e.target.value)} placeholder="예: A" /></Field>
        </>
      )}
      {q.question_type === 'direct_fact' && (
        <>
          <Field label="Fact Key">
            <select style={inputStyle} value={q.fact_key} onChange={e => upd('fact_key', e.target.value)}>
              <option value="">(선택)</option>
              {FACT_REGISTRY.map(f => <option key={f.key} value={f.key}>{f.key} · {f.category}</option>)}
            </select>
          </Field>
          <Field label="Operator">
            <select style={inputStyle} value={q.operator} onChange={e => upd('operator', e.target.value)}>
              {['==', '!=', '>', '<', '>=', '<='].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Compare Value"><input style={inputStyle} value={q.compare_value} onChange={e => upd('compare_value', e.target.value)} /></Field>
        </>
      )}
    </div>
  );
}

// =========================================================
//  EFFECT BUILDER — Effect 노드 및 End의 on_end_effects 공용
// =========================================================
const EFFECT_TYPE_LABELS_STANDARD = {
  set_quest_ending: '퀘스트 결말 설정',
  set_flag:         '진행 플래그 설정',
  change_counter:   '카운터 증가',
  mark_visited:     '영역 방문 처리',
  set_entry_route:  '진입경로 기록'
};

function EffectItem({ value, onChange, onDelete, index }) {
  const e = value;
  const upd = (key, val) => onChange({ ...e, [key]: val });
  return (
    <div style={{ background: '#13110e', border: '1px solid #25221d', borderRadius: 3, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9.5, color: '#7a7468', fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>효과 #{index + 1}</span>
        <button onClick={onDelete} style={{ ...iconBtn, padding: '3px 6px' }}><X size={10} /></button>
      </div>
      <label style={labelStyle}>Effect Type</label>
      <select style={inputStyle} value={e.effect_type} onChange={ev => upd('effect_type', ev.target.value)}>
        {Object.entries(EFFECT_TYPE_LABELS_STANDARD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        <option disabled>───────────────</option>
        <option value="direct_fact">(고급) Fact 직접 쓰기</option>
      </select>
      {e.effect_type === 'set_quest_ending' && (
        <>
          <label style={labelStyle}>Quest ID</label>
          <input style={inputStyle} value={e.quest_id || ''} onChange={ev => upd('quest_id', ev.target.value)} placeholder="예: rainbow_lake" />
          <label style={labelStyle}>Ending Tag</label>
          <input style={inputStyle} value={e.ending_tag || ''} onChange={ev => upd('ending_tag', ev.target.value)} placeholder="A / B / C" />
        </>
      )}
      {e.effect_type === 'set_flag' && (
        <>
          <label style={labelStyle}>Flag Key</label>
          <input style={inputStyle} value={e.flag_key || ''} onChange={ev => upd('flag_key', ev.target.value)} />
          <label style={labelStyle}>Flag Value</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#d4cdbf', marginTop: 4 }}>
            <input type="checkbox" checked={e.flag_value !== false} onChange={ev => upd('flag_value', ev.target.checked)} />
            true
          </label>
        </>
      )}
      {e.effect_type === 'change_counter' && (
        <>
          <label style={labelStyle}>대상 (카운터)</label>
          <TargetPicker value={e.counter_target || { mode: 'tag', actorGuid: null, tag: null }} onChange={v => upd('counter_target', v)} allowedTypes={['Monster', 'NPC']} defaultMode="tag" />
          <label style={labelStyle}>Delta</label>
          <input type="number" style={inputStyle} value={e.counter_delta ?? 0} onChange={ev => upd('counter_delta', Number(ev.target.value))} />
        </>
      )}
      {e.effect_type === 'mark_visited' && (
        <>
          <label style={labelStyle}>영역 (Trigger)</label>
          <TargetPicker value={e.area_target || { mode: 'actor', actorGuid: null, tag: null }} onChange={v => upd('area_target', v)} allowedTypes={['Trigger']} defaultMode="actor" />
        </>
      )}
      {e.effect_type === 'set_entry_route' && (
        <>
          <label style={labelStyle}>Route Tag</label>
          <select style={inputStyle} value={e.route_tag || ''} onChange={ev => upd('route_tag', ev.target.value)}>
            <option value="">(선택)</option>
            {GAMEPLAY_TAGS.filter(t => t.startsWith('EntryRoute.')).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </>
      )}
      {e.effect_type === 'direct_fact' && (
        <>
          <label style={labelStyle}>Fact Key</label>
          <select style={inputStyle} value={e.fact_key || ''} onChange={ev => upd('fact_key', ev.target.value)}>
            <option value="">(선택)</option>
            {FACT_REGISTRY.filter(f => f.owner === 'quest').map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
          </select>
          <label style={labelStyle}>Operation</label>
          <select style={inputStyle} value={e.operation || 'set'} onChange={ev => upd('operation', ev.target.value)}>
            <option value="set">set</option><option value="add">add</option><option value="subtract">subtract</option>
          </select>
          <label style={labelStyle}>Value</label>
          <input style={inputStyle} value={e.value || ''} onChange={ev => upd('value', ev.target.value)} />
        </>
      )}
    </div>
  );
}

function EffectBuilder({ value = [], onChange }) {
  const add = () => onChange([...value, { effect_type: 'set_quest_ending', quest_id: '', ending_tag: '' }]);
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const upd = (i, val) => onChange(value.map((v, idx) => idx === i ? val : v));
  return (
    <div>
      {value.map((e, i) => (
        <EffectItem key={i} value={e} onChange={val => upd(i, val)} onDelete={() => remove(i)} index={i} />
      ))}
      <button onClick={add} style={{ ...iconBtn, width: '100%', justifyContent: 'center', gap: 6, marginTop: 4, fontSize: 10.5 }}>
        <Plus size={11} /> 효과 추가
      </button>
    </div>
  );
}

// =========================================================
//  PROPERTY PANEL
// =========================================================
function PropertyPanel({ node, onChange, onDelete }) {
  if (!node) {
    return (
      <div style={{ padding: 18, color: '#7a7468', fontSize: 12, lineHeight: 1.7 }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.18em', color: '#a89a7a', marginBottom: 14, textTransform: 'uppercase' }}>INSPECTOR</div>
        노드를 선택하면 속성을 편집할 수 있습니다.
        <div style={{ marginTop: 28, padding: 12, background: '#1a1814', border: '1px solid #2a2620', borderRadius: 4, fontSize: 10.5, lineHeight: 1.6 }}>
          <div style={{ color: '#c4b5fd', marginBottom: 6, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em' }}>TIP</div>
          좌측 팔레트에서 노드를 클릭해 추가하세요. 핀에서 다른 핀으로 드래그하면 연결됩니다.
        </div>
      </div>
    );
  }
  const def = NODE_TYPES[node.type];
  const style = CATEGORY_STYLES[def.category];
  const update = (key, val) => onChange(node.id, { ...node.props, [key]: val });
  const updateAll = (newProps) => onChange(node.id, { ...node.props, ...newProps });

  return (
    <div style={{ padding: 18, fontSize: 12, color: '#d4cdbf' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.18em', color: style.accent, textTransform: 'uppercase' }}>{def.label}</div>
          <div style={{ fontSize: 10, color: '#7a7468', marginTop: 2 }}>{def.desc}</div>
        </div>
        <button onClick={() => onDelete(node.id)} style={iconBtn}><Trash2 size={13} /></button>
      </div>
      <div style={{ borderTop: '1px solid #2a2620', paddingTop: 14 }}>
        {renderProperties(node, update, updateAll)}
      </div>
      <div style={{ marginTop: 18, padding: 10, background: '#13110e', border: '1px solid #25221d', borderRadius: 3 }}>
        <div style={{ fontSize: 9.5, color: '#7a7468', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>ID</div>
        <div style={{ fontSize: 11, color: '#a89a7a', fontFamily: '"JetBrains Mono", monospace', marginTop: 3 }}>{node.id}</div>
      </div>
    </div>
  );
}

const iconBtn = {
  background: 'transparent', border: '1px solid #3a342c', color: '#a89a7a',
  padding: '5px 7px', borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center'
};
const inputStyle = {
  width: '100%', background: '#13110e', border: '1px solid #2a2620',
  color: '#e8e1d0', padding: '6px 8px', fontSize: 11,
  fontFamily: '"JetBrains Mono", monospace', borderRadius: 3,
  outline: 'none', boxSizing: 'border-box'
};
const labelStyle = {
  display: 'block', fontSize: 9.5, color: '#7a7468',
  fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.08em',
  marginBottom: 4, marginTop: 12, textTransform: 'uppercase'
};
function Field({ label, children }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

function renderProperties(node, update, updateAll) {
  const p = node.props;
  const tgt = p.target || { mode: 'actor', actorGuid: null, tag: null };

  switch (node.type) {
    case 'Start':
      return (
        <>
          <Field label="Trigger Type">
            <select style={inputStyle} value={p.trigger_type} onChange={e => update('trigger_type', e.target.value)}>
              <option value="on_interact">on_interact · 상호작용</option>
              <option value="on_proximity">on_proximity · 근접</option>
              <option value="on_area_enter">on_area_enter · 영역 진입</option>
              <option value="on_quest_state">on_quest_state · 퀘스트 상태</option>
            </select>
          </Field>
          {p.trigger_type === 'on_interact' && <Field label="대상 (Interactable / NPC)"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Interactable', 'NPC']} defaultMode="actor" /></Field>}
          {p.trigger_type === 'on_proximity' && <>
            <Field label="대상 (NPC)"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['NPC']} defaultMode="actor" /></Field>
            <Field label="거리 (m)"><input type="number" style={inputStyle} value={p.distance_m} onChange={e => update('distance_m', Number(e.target.value))} /></Field>
          </>}
          {p.trigger_type === 'on_area_enter' && <Field label="트리거 영역"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Trigger']} defaultMode="actor" /></Field>}
          {p.trigger_type === 'on_quest_state' && <>
            <Field label="Target Quest ID"><input style={inputStyle} value={p.target_quest || ''} onChange={e => update('target_quest', e.target.value)} placeholder="예: buried_ones" /></Field>
            <Field label="Required Ending"><input style={inputStyle} value={p.required_ending || ''} onChange={e => update('required_ending', e.target.value)} placeholder="예: A" /></Field>
          </>}
          <Field label="자동 수락">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#d4cdbf' }}>
              <input type="checkbox" checked={p.is_auto_accept} onChange={e => update('is_auto_accept', e.target.checked)} /> is_auto_accept
            </label>
          </Field>
          <Field label="Entry Route Tag"><input style={inputStyle} value={p.entry_route_tag} onChange={e => update('entry_route_tag', e.target.value)} placeholder="예: EntryRoute.Board" /></Field>
          <Field label="Priority"><input type="number" style={inputStyle} value={p.priority} onChange={e => update('priority', Number(e.target.value))} /></Field>
          <Field label="HUD 추적 기본값">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#d4cdbf' }}>
              <input type="checkbox" checked={p.is_tracked} onChange={e => update('is_tracked', e.target.checked)} /> is_tracked
            </label>
          </Field>
        </>
      );

    case 'End':
      return (
        <>
          <Field label="Ending Tag"><input style={inputStyle} value={p.ending_tag} onChange={e => update('ending_tag', e.target.value)} /></Field>
          <Field label="Ending Title"><input style={inputStyle} value={p.ending_title || ''} onChange={e => update('ending_title', e.target.value)} placeholder="HUD/엔딩 화면 표시 이름" /></Field>
          <Field label="On-End Effects">
            <EffectBuilder value={p.on_end_effects || []} onChange={v => update('on_end_effects', v)} />
          </Field>
        </>
      );

    case 'Check':
      return (
        <>
          <QuestionBuilder value={p} onChange={updateAll} />
          <Field label="Description (메모)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={p.description} onChange={e => update('description', e.target.value)} />
          </Field>
        </>
      );

    case 'Wait':
      return (
        <>
          <Field label="Wait Type">
            <select style={inputStyle} value={p.wait_type} onChange={e => update('wait_type', e.target.value)}>
              <option value="timer">timer</option>
              <option value="fact_change">fact_change</option>
            </select>
          </Field>
          {p.wait_type === 'timer' && <Field label="Duration (초)"><input type="number" step="0.1" style={inputStyle} value={p.duration_sec} onChange={e => update('duration_sec', Number(e.target.value))} /></Field>}
          {p.wait_type === 'fact_change' && (
            <Field label="Watch Fact">
              <select style={inputStyle} value={p.watch_fact} onChange={e => update('watch_fact', e.target.value)}>
                <option value="">(선택)</option>
                {FACT_REGISTRY.map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
              </select>
            </Field>
          )}
        </>
      );

    case 'Phase':
      return (
        <>
          <Field label="Objective Text (HUD 표시)">
            <input style={inputStyle} value={p.objective_text} onChange={e => update('objective_text', e.target.value)} placeholder="넓은 범위로 작성" />
          </Field>
          <Field label="Goal Type">
            <select style={inputStyle} value={p.goal_type} onChange={e => update('goal_type', e.target.value)}>
              <option value="kill_count">kill_count</option>
              <option value="item_collect">item_collect</option>
              <option value="area_reach">area_reach</option>
              <option value="interact">interact</option>
              <option value="kill_and_collect">kill_and_collect</option>
              <option value="sequence_interact">sequence_interact</option>
              <option value="custom">custom</option>
            </select>
          </Field>
          {p.goal_type === 'kill_count' && <>
            <Field label="대상 (Monster / NPC)"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Monster', 'NPC']} defaultMode="tag" /></Field>
            <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={e => update('count', Number(e.target.value))} /></Field>
          </>}
          {p.goal_type === 'item_collect' && <>
            <Field label="Item ID"><input style={inputStyle} value={p.item_id} onChange={e => update('item_id', e.target.value)} /></Field>
            <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={e => update('count', Number(e.target.value))} /></Field>
          </>}
          {p.goal_type === 'area_reach' && <Field label="트리거 영역"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Trigger']} defaultMode="actor" /></Field>}
          {p.goal_type === 'interact' && <>
            <Field label="대상 (Interactable / NPC)"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Interactable', 'NPC']} defaultMode="actor" /></Field>
            <Field label="상호작용 유형">
              <select style={inputStyle} value={p.interaction_type} onChange={e => update('interaction_type', e.target.value)}>
                <option value="use">use</option><option value="collect">collect</option>
                <option value="talk">talk</option><option value="examine">examine</option>
              </select>
            </Field>
            <Field label="프롬프트 텍스트"><input style={inputStyle} value={p.prompt_text} onChange={e => update('prompt_text', e.target.value)} /></Field>
          </>}
          {p.goal_type === 'kill_and_collect' && <>
            <Field label="대상 (Monster)"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Monster']} defaultMode="tag" /></Field>
            <Field label="Item ID"><input style={inputStyle} value={p.item_id} onChange={e => update('item_id', e.target.value)} /></Field>
            <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={e => update('count', Number(e.target.value))} /></Field>
          </>}
          {p.goal_type === 'sequence_interact' && <>
            <Field label="Targets (순서대로)"><TargetPickerList value={p.targets || []} onChange={v => update('targets', v)} allowedTypes={['Interactable']} defaultMode="actor" /></Field>
            <Field label="잘못된 순서 시">
              <select style={inputStyle} value={p.on_wrong_order} onChange={e => update('on_wrong_order', e.target.value)}>
                <option value="reset">reset</option><option value="ignore">ignore</option><option value="fail">fail</option>
              </select>
            </Field>
          </>}
          {p.goal_type === 'custom' && <>
            <Field label="Function ID"><input style={inputStyle} value={p.function_id} onChange={e => update('function_id', e.target.value)} /></Field>
            <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={p.description} onChange={e => update('description', e.target.value)} /></Field>
          </>}
          <Field label="Hints (목표 달성 단서)">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={(p.hints || []).join('\n')} onChange={e => update('hints', e.target.value.split('\n').filter(Boolean))} placeholder="한 줄에 하나씩" />
          </Field>
          <Field label="Alt Completion Facts">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={(p.alt_completion_facts || []).join('\n')} onChange={e => update('alt_completion_facts', e.target.value.split('\n').filter(Boolean))} placeholder="예: kill_count_frog>=10" />
          </Field>
          <Field label="Journal Entry"><input style={inputStyle} value={p.journal_entry} onChange={e => update('journal_entry', e.target.value)} /></Field>
          <Field label="선택적 목표">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <input type="checkbox" checked={p.is_optional} onChange={e => update('is_optional', e.target.checked)} /> is_optional
            </label>
          </Field>
        </>
      );

    case 'PhaseGroup':
      return (
        <>
          <Field label="Policy">
            <select style={inputStyle} value={p.policy} onChange={e => update('policy', e.target.value)}>
              <option value="ALL">ALL · 모두 완료 시 진행</option>
              <option value="ANY">ANY · 하나만 완료되면 진행</option>
              <option value="SEQUENCE">SEQUENCE · 순서대로 진행</option>
            </select>
          </Field>
          <Field label="Skip 조건 (없으면 Skip 핀 없음)">
            {p.skip_on ? (
              <>
                <QuestionBuilder value={p.skip_on} onChange={v => update('skip_on', v)} />
                <button onClick={() => update('skip_on', null)} style={{ ...iconBtn, marginTop: 8, width: '100%', justifyContent: 'center', fontSize: 10.5 }}>
                  <X size={11} /> Skip 조건 제거
                </button>
              </>
            ) : (
              <button onClick={() => update('skip_on', { ...DEFAULT_QUESTION })} style={{ ...iconBtn, width: '100%', justifyContent: 'center', gap: 6, fontSize: 10.5 }}>
                <Plus size={11} /> Skip 조건 설정
              </button>
            )}
          </Field>
        </>
      );

    case 'Dialogue':
      return (
        <>
          <Field label="Scene Asset"><input style={inputStyle} value={p.scene_asset} onChange={e => update('scene_asset', e.target.value)} /></Field>
          <Field label="Participants (NPC)"><TargetPickerList value={p.participants || []} onChange={v => update('participants', v)} allowedTypes={['NPC']} defaultMode="actor" /></Field>
          <Field label="Camera Mode">
            <select style={inputStyle} value={p.camera_mode} onChange={e => update('camera_mode', e.target.value)}>
              <option value="close_up">close_up</option>
              <option value="over_shoulder">over_shoulder</option>
              <option value="free">free</option>
            </select>
          </Field>
          <Field label="Context Facts (대화 진입 시 참조)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={(p.context_facts || []).join('\n')} onChange={e => update('context_facts', e.target.value.split('\n').filter(Boolean))} />
          </Field>
        </>
      );

    case 'Cutscene':
      return (
        <>
          <Field label="Sequence Asset"><input style={inputStyle} value={p.sequence_asset} onChange={e => update('sequence_asset', e.target.value)} /></Field>
          <Field label="스킵 가능">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <input type="checkbox" checked={p.skippable} onChange={e => update('skippable', e.target.checked)} /> skippable
            </label>
          </Field>
          <Field label="On-Skip Fact">
            <select style={inputStyle} value={p.on_skip_fact} onChange={e => update('on_skip_fact', e.target.value)}>
              <option value="">(없음)</option>
              {FACT_REGISTRY.filter(f => f.owner === 'quest').map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
            </select>
          </Field>
        </>
      );

    case 'Action':
      return (
        <>
          <Field label="Action Type">
            <select style={inputStyle} value={p.action_type} onChange={e => update('action_type', e.target.value)}>
              <option value="npc_state_change">npc_state_change</option>
              <option value="spawn">spawn</option>
              <option value="object_toggle">object_toggle</option>
              <option value="weather_change">weather_change</option>
              <option value="bgm_play">bgm_play</option>
              <option value="custom">custom</option>
            </select>
          </Field>
          {p.action_type === 'npc_state_change' && <>
            <Field label="NPC"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['NPC']} defaultMode="actor" /></Field>
            <Field label="상태값"><input style={inputStyle} value={p.state_value} onChange={e => update('state_value', e.target.value)} placeholder="예: walk, attack, flee" /></Field>
          </>}
          {p.action_type === 'spawn' && <>
            <Field label="스포너 (Trigger)"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Trigger']} defaultMode="actor" /></Field>
            <Field label="프리셋"><input style={inputStyle} value={p.preset} onChange={e => update('preset', e.target.value)} /></Field>
            <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={e => update('count', Number(e.target.value))} /></Field>
            <Field label="실패 시 제거">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <input type="checkbox" checked={p.remove_on_fail} onChange={e => update('remove_on_fail', e.target.checked)} /> remove_on_fail
              </label>
            </Field>
          </>}
          {p.action_type === 'object_toggle' && <>
            <Field label="오브젝트 (Interactable)"><TargetPicker value={tgt} onChange={v => update('target', v)} allowedTypes={['Interactable']} defaultMode="actor" /></Field>
            <Field label="활성화">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <input type="checkbox" checked={p.enabled} onChange={e => update('enabled', e.target.checked)} /> enabled
              </label>
            </Field>
          </>}
          {p.action_type === 'weather_change' && (
            <Field label="날씨 프리셋">
              <select style={inputStyle} value={p.weather_preset} onChange={e => update('weather_preset', e.target.value)}>
                <option value="clear">clear</option><option value="rain">rain</option>
                <option value="storm">storm</option><option value="snow">snow</option><option value="fog">fog</option>
              </select>
            </Field>
          )}
          {p.action_type === 'bgm_play' && <Field label="사운드 에셋"><input style={inputStyle} value={p.sound_asset} onChange={e => update('sound_asset', e.target.value)} /></Field>}
          {p.action_type === 'custom' && <>
            <Field label="Function ID"><input style={inputStyle} value={p.function_id} onChange={e => update('function_id', e.target.value)} /></Field>
            <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={p.description} onChange={e => update('description', e.target.value)} /></Field>
          </>}
        </>
      );

    case 'Reward':
      return (
        <>
          <Field label="XP"><input type="number" style={inputStyle} value={p.xp} onChange={e => update('xp', Number(e.target.value))} /></Field>
          <Field label="Gold"><input type="number" style={inputStyle} value={p.gold} onChange={e => update('gold', Number(e.target.value))} /></Field>
          <Field label="Items (id:count, 줄바꿈 구분)">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={(p.items || []).map(it => `${it.id}:${it.count}`).join('\n')}
              onChange={e => update('items', e.target.value.split('\n').filter(Boolean).map(line => {
                const [id, count] = line.split(':');
                return { id: id?.trim() || '', count: Number(count) || 1 };
              }))} placeholder="ITEM_0001:1" />
          </Field>
          <Field label="레벨 스케일링">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <input type="checkbox" checked={p.scale_to_level} onChange={e => update('scale_to_level', e.target.checked)} /> scale_to_level
            </label>
          </Field>
        </>
      );

    case 'Effect':
      return (
        <Field label="Effects">
          <EffectBuilder value={p.effects || []} onChange={v => update('effects', v)} />
        </Field>
      );

    default: return null;
  }
}

// =========================================================
//  PIN POSITIONS
// =========================================================
function getPinPos(node, pinSide, pinIdx) {
  const def = NODE_TYPES[node.type];
  if (pinSide === 'in') return { x: node.x, y: node.y + NODE_H / 2 };
  // PhaseGroup SKIP pin
  if (node.type === 'PhaseGroup' && pinIdx === 1) return { x: node.x + NODE_W, y: node.y + NODE_H - 8 };
  if (def.outPins === 1) return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
  if (def.outPins === 2) {
    if (pinIdx === 0) return { x: node.x + NODE_W, y: node.y + 34 };
    return { x: node.x + NODE_W, y: node.y + NODE_H - 8 };
  }
  return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
}

function bezierPath(x1, y1, x2, y2) {
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// =========================================================
//  MAIN COMPONENT
// =========================================================
export default function QuestGraphEditor() {
  const [activeQuestId, setActiveQuestId] = useState('buried_ones');
  const initial = buildBuriedOnesQuest();
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const [groups, setGroups] = useState(initial.groups);
  const [selectedId, setSelectedId] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.85);
  const [isPanning, setIsPanning] = useState(false);
  const [dragNode, setDragNode] = useState(null);
  const [pendingEdge, setPendingEdge] = useState(null);
  const [toast, setToast] = useState(null);
  const canvasRef = useRef(null);
  const idCounter = useRef(100);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const loadQuest = (questId) => {
    const q = QUESTS.find(q => q.id === questId);
    if (!q) return;
    const data = q.build();
    setNodes(data.nodes);
    setEdges(data.edges);
    setGroups(data.groups);
    setSelectedId(null);
    setActiveQuestId(questId);
    idCounter.current = 200;
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.dataset.bg === '1') {
      setSelectedId(null);
      if (e.button === 1 || e.shiftKey) setIsPanning(true);
    }
  };
  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation(); setSelectedId(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top - pan.y) / zoom;
    setDragNode({ id: nodeId, offsetX: mx - node.x, offsetY: my - node.y });
  };
  const handlePinMouseDown = (e, nodeId, pinIdx) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    setPendingEdge({ from: nodeId, fromPin: pinIdx, x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom });
  };
  const handlePinMouseUp = (nodeId, pinIdx, side) => {
    if (pendingEdge && side === 'in' && pendingEdge.from !== nodeId) {
      const exists = edges.find(e => e.from === pendingEdge.from && e.fromPin === pendingEdge.fromPin && e.to === nodeId);
      if (!exists) setEdges(prev => [...prev, { from: pendingEdge.from, fromPin: pendingEdge.fromPin, to: nodeId, toPin: pinIdx }]);
    }
    setPendingEdge(null);
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (isPanning) { setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY })); return; }
      if (dragNode) {
        const mx = (e.clientX - rect.left - pan.x) / zoom;
        const my = (e.clientY - rect.top - pan.y) / zoom;
        setNodes(prev => prev.map(n => n.id === dragNode.id ? { ...n, x: mx - dragNode.offsetX, y: my - dragNode.offsetY } : n));
      }
      if (pendingEdge) {
        const mx = (e.clientX - rect.left - pan.x) / zoom;
        const my = (e.clientY - rect.top - pan.y) / zoom;
        setPendingEdge(pe => ({ ...pe, x: mx, y: my }));
      }
    };
    const onUp = () => { setIsPanning(false); setDragNode(null); setPendingEdge(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isPanning, dragNode, pendingEdge, pan, zoom]);

  const handleWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(1.6, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  const addNode = (type) => {
    idCounter.current += 1;
    const newNode = { id: `n${idCounter.current}`, type, x: (-pan.x + 400) / zoom, y: (-pan.y + 200) / zoom, props: { ...NODE_TYPES[type].defaults } };
    setNodes(prev => [...prev, newNode]);
    setSelectedId(newNode.id);
  };
  const updateNodeProps = (id, props) => setNodes(prev => prev.map(n => n.id === id ? { ...n, props } : n));
  const deleteNode = (id) => { setNodes(prev => prev.filter(n => n.id !== id)); setEdges(prev => prev.filter(e => e.from !== id && e.to !== id)); setSelectedId(null); };

  // Sequence index badges
  const seqIndexMap = {};
  const memberCountMap = {};
  groups.forEach(g => {
    memberCountMap[g.groupNodeId] = g.memberIds.length;
    const gNode = nodes.find(n => n.id === g.groupNodeId);
    if (gNode?.props?.policy === 'SEQUENCE') {
      const members = nodes.filter(n => g.memberIds.includes(n.id));
      [...members].sort((a, b) => a.y - b.y).forEach((m, idx) => { seqIndexMap[m.id] = idx + 1; });
    }
  });

  const groupBoxes = groups.map(g => {
    const gNode = nodes.find(n => n.id === g.groupNodeId);
    const members = nodes.filter(n => g.memberIds.includes(n.id));
    if (members.length === 0) return null;
    const xs = members.map(n => n.x), ys = members.map(n => n.y);
    return {
      id: g.id,
      x: Math.min(...xs) - 16, y: Math.min(...ys) - 24,
      w: Math.max(...xs) + NODE_W + 16 - (Math.min(...xs) - 16),
      h: Math.max(...ys) + NODE_H + 16 - (Math.min(...ys) - 24),
      policy: gNode?.props?.policy || 'ALL'
    };
  }).filter(Boolean);

  const selectedNode = nodes.find(n => n.id === selectedId);

  const palette = [
    { cat: 'flow',      items: ['Start', 'End', 'Check', 'Wait'] },
    { cat: 'objective', items: ['Phase', 'PhaseGroup'] },
    { cat: 'content',   items: ['Dialogue', 'Cutscene'] },
    { cat: 'system',    items: ['Action', 'Reward', 'Effect'] }
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f0d0a', color: '#e8e1d0', fontFamily: '"IBM Plex Sans KR", "Inter", system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet" />

      {/* TOP BAR */}
      <div style={{ height: 52, background: 'linear-gradient(180deg, #1a1814 0%, #15130f 100%)', borderBottom: '1px solid #2a2620', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 22, fontWeight: 600, color: '#e8e1d0', letterSpacing: '-0.01em' }}>Quest Forge</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#7a7468', letterSpacing: '0.15em' }}>v0.2 · PORTFOLIO DEMO</span>
        </div>
        <div style={{ width: 1, height: 24, background: '#2a2620', margin: '0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#a89a7a' }}>
          <FileCode size={13} />
          <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            {QUESTS.find(q => q.id === activeQuestId)?.filename ?? 'untitled.qgraph'}
          </span>
        </div>

        {/* 퀘스트 선택 드롭다운 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9.5, color: '#7a7468', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>QUEST</span>
          <select
            value={activeQuestId}
            onChange={e => loadQuest(e.target.value)}
            style={{
              background: '#1a1814', border: '1px solid #3a342c',
              color: '#d4cdbf', padding: '5px 10px', fontSize: 11,
              fontFamily: '"JetBrains Mono", monospace',
              borderRadius: 3, cursor: 'pointer', outline: 'none'
            }}
          >
            {QUESTS.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
        </div>

        <div style={{ flex: 1 }} />
        <button onClick={() => showToast('Save · 데모 버전에서는 저장되지 않습니다')} style={toolBtn}><Save size={13} /> Save</button>
        <button onClick={() => showToast('Export · 데모 버전에서는 추출되지 않습니다')} style={toolBtn}><Download size={13} /> Export XLSX</button>
      </div>

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* LEFT PALETTE */}
        <div style={{ width: 200, background: '#13110e', borderRight: '1px solid #25221d', padding: '16px 12px', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.18em', color: '#7a7468', marginBottom: 12, textTransform: 'uppercase' }}>NODE PALETTE</div>
          {palette.map(group => {
            const style = CATEGORY_STYLES[group.cat];
            return (
              <div key={group.cat} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: style.accent, marginBottom: 6, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, background: style.border, borderRadius: 1 }} />{style.name}
                </div>
                {group.items.map(t => {
                  const def = NODE_TYPES[t];
                  const Icon = def.icon;
                  return (
                    <button key={t} onClick={() => addNode(t)}
                      style={{ width: '100%', textAlign: 'left', background: '#1a1814', border: `1px solid ${style.border}33`, color: '#d4cdbf', padding: '7px 9px', marginBottom: 4, borderRadius: 3, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', transition: 'all 120ms ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = style.bg; e.currentTarget.style.borderColor = style.border; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#1a1814'; e.currentTarget.style.borderColor = `${style.border}33`; }}>
                      <Icon size={12} color={style.accent} />
                      <span>{def.label}</span>
                      <Plus size={11} style={{ marginLeft: 'auto', color: '#7a7468' }} />
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div style={{ marginTop: 24, padding: 11, background: '#0a0907', border: '1px solid #25221d', borderRadius: 3, fontSize: 10, lineHeight: 1.7, color: '#7a7468' }}>
            <div style={{ color: '#a89a7a', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em', marginBottom: 5, fontSize: 9.5 }}>SHORTCUTS</div>
            <div>· Drag · 노드 이동</div>
            <div>· Pin → Pin · 연결</div>
            <div>· Scroll · 줌</div>
            <div>· Shift+Drag · 화면 이동</div>
          </div>
        </div>

        {/* CANVAS */}
        <div ref={canvasRef} onMouseDown={handleCanvasMouseDown} onWheel={handleWheel}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', background: `radial-gradient(circle at 20% 30%, rgba(94,234,212,0.025), transparent 50%), radial-gradient(circle at 80% 70%, rgba(167,139,250,0.025), transparent 50%), #0a0907`, cursor: isPanning ? 'grabbing' : 'default' }}>
          <div data-bg="1" style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(120,110,90,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(120,110,90,0.04) 1px, transparent 1px), linear-gradient(rgba(120,110,90,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,110,90,0.08) 1px, transparent 1px)`, backgroundSize: `${20*zoom}px ${20*zoom}px, ${20*zoom}px ${20*zoom}px, ${100*zoom}px ${100*zoom}px, ${100*zoom}px ${100*zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px`, pointerEvents: 'none' }} />

          <div style={{ position: 'absolute', left: pan.x, top: pan.y, transform: `scale(${zoom})`, transformOrigin: '0 0', width: 1, height: 1 }}>
            {/* Group containers */}
            {groupBoxes.map(g => (
              <div key={g.id} style={{ position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, border: '1.5px dashed #5eead499', borderRadius: 8, background: 'rgba(94,234,212,0.025)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: -10, left: 12, background: '#0a0907', padding: '0 8px', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.15em', color: '#5eead4' }}>
                  {g.policy === 'SEQUENCE' ? 'SEQUENCE' : `PARALLEL · ${g.policy}`}
                </div>
              </div>
            ))}

            {/* Edges */}
            <svg style={{ position: 'absolute', left: -2000, top: -2000, width: 6000, height: 6000, pointerEvents: 'none', overflow: 'visible' }}>
              <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L0,10 L9,5 z" fill="#a89a7a" /></marker>
                <marker id="arrow-true" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L0,10 L9,5 z" fill="#5eead4" /></marker>
                <marker id="arrow-false" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L0,10 L9,5 z" fill="#fb7185" /></marker>
                <marker id="arrow-skip" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L0,10 L9,5 z" fill="#fbbf24" /></marker>
              </defs>
              <g transform="translate(2000,2000)">
                {edges.map((edge, i) => {
                  const from = nodes.find(n => n.id === edge.from);
                  const to = nodes.find(n => n.id === edge.to);
                  if (!from || !to) return null;
                  const fp = getPinPos(from, 'out', edge.fromPin);
                  const tp = getPinPos(to, 'in', 0);
                  const fromDef = NODE_TYPES[from.type];
                  let color = '#a89a7a', marker = 'arrow';
                  if (fromDef.outPins === 2) {
                    color = edge.fromPin === 0 ? '#5eead4' : '#fb7185';
                    marker = edge.fromPin === 0 ? 'arrow-true' : 'arrow-false';
                  }
                  if (from.type === 'PhaseGroup' && edge.fromPin === 1) { color = '#fbbf24'; marker = 'arrow-skip'; }
                  return <path key={i} d={bezierPath(fp.x, fp.y, tp.x - 4, tp.y)} stroke={color} strokeWidth="1.5" fill="none" opacity="0.85" markerEnd={`url(#${marker})`} />;
                })}
                {pendingEdge && (() => {
                  const from = nodes.find(n => n.id === pendingEdge.from);
                  if (!from) return null;
                  const fp = getPinPos(from, 'out', pendingEdge.fromPin);
                  return <path d={bezierPath(fp.x, fp.y, pendingEdge.x, pendingEdge.y)} stroke="#e8e1d0" strokeWidth="1.5" strokeDasharray="5 4" fill="none" opacity="0.7" />;
                })()}
              </g>
            </svg>

            {/* Nodes */}
            {nodes.map(node => (
              <NodeView key={node.id} node={node} selected={node.id === selectedId}
                onMouseDownNode={handleNodeMouseDown} onPinMouseDown={handlePinMouseDown}
                onPinMouseUp={handlePinMouseUp} onDoubleClick={(id) => setSelectedId(id)}
                seqIndex={seqIndexMap[node.id]}
                memberCount={memberCountMap[node.id]}
              />
            ))}
          </div>

          <div style={{ position: 'absolute', bottom: 16, left: 16, padding: '6px 11px', background: '#1a1814cc', backdropFilter: 'blur(8px)', border: '1px solid #2a2620', borderRadius: 3, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#a89a7a', letterSpacing: '0.06em' }}>
            {Math.round(zoom * 100)}% · {nodes.length} nodes · {edges.length} edges
          </div>

          {(() => {
            const aq = QUESTS.find(q => q.id === activeQuestId);
            return (
              <div style={{ position: 'absolute', top: 16, right: 16, padding: '10px 14px', background: '#1a1814cc', backdropFilter: 'blur(8px)', border: '1px solid #2a2620', borderRadius: 3, maxWidth: 300 }}>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.18em', color: '#7a7468', marginBottom: 4 }}>QUEST</div>
                <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 17, fontWeight: 600, color: '#e8e1d0', lineHeight: 1.2 }}>{aq?.label ?? '새 퀘스트'}</div>
                <div style={{ fontSize: 10.5, color: '#a89a7a', marginTop: 4, lineHeight: 1.4 }}>{aq?.subtitle ?? ''}</div>
              </div>
            );
          })()}
        </div>

        {/* RIGHT INSPECTOR */}
        <div style={{ width: 320, background: '#13110e', borderLeft: '1px solid #25221d', overflowY: 'auto', flexShrink: 0 }}>
          <PropertyPanel node={selectedNode} onChange={updateNodeProps} onDelete={deleteNode} />
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1a1814', border: '1px solid #fbbf2455', borderLeft: '3px solid #fbbf24', color: '#fcd34d', padding: '10px 18px', fontSize: 12, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.02em', borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const toolBtn = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: '#1a1814', border: '1px solid #3a342c', color: '#d4cdbf',
  padding: '7px 13px', fontSize: 11.5, fontFamily: 'inherit',
  borderRadius: 3, cursor: 'pointer', letterSpacing: '0.02em'
};
