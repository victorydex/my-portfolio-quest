import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Square, GitBranch, Clock, Target, Layers,
  MessageCircle, Film, Zap, Gift, Database, Link2,
  Download, Save, Trash2, Plus, X, ChevronDown, FileCode
} from 'lucide-react';

// =========================================================
//  NODE TYPE REGISTRY
// =========================================================
const NODE_TYPES = {
  Start: {
    category: 'flow', label: 'Start', icon: Play,
    desc: '퀘스트 진입점', inPins: 0, outPins: 1,
    defaults: { activation_condition: '', priority: 0, is_tracked: true }
  },
  End: {
    category: 'flow', label: 'End', icon: Square,
    desc: '퀘스트 종료점', inPins: 1, outPins: 0,
    defaults: { ending_tag: 'A', result_type: 'success', on_end_facts: [] }
  },
  Condition: {
    category: 'flow', label: 'Condition', icon: GitBranch,
    desc: 'Fact 검사 분기', inPins: 1, outPins: 2,
    defaults: { fact_key: '', operator: '==', compare_value: '', description: '' }
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
      // dynamic params:
      target_tag: '', count: 1, item_id: '',
      trigger_tag: '', interaction_type: 'use', prompt_text: '',
      targets: [], on_wrong_order: 'reset',
      function_id: '', description: ''
    }
  },
  PhaseGroup: {
    category: 'objective', label: 'Phase Group', icon: Layers,
    desc: '병렬 목표 컨테이너', inPins: 1, outPins: 1,
    defaults: { policy: 'ALL' }
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
      npc_tag: '', state_value: '',
      spawner_tag: '', preset: '', count: 1, remove_on_fail: false,
      object_tag: '', enabled: true,
      weather_preset: 'clear',
      sound_asset: '',
      function_id: '', description: ''
    }
  },
  Reward: {
    category: 'system', label: 'Reward', icon: Gift,
    desc: '보상 지급', inPins: 1, outPins: 1,
    defaults: { xp: 0, gold: 0, items: [], scale_to_level: true }
  },
  FactSet: {
    category: 'system', label: 'Fact Set', icon: Database,
    desc: 'Fact 값 직접 기록', inPins: 1, outPins: 1,
    defaults: { fact_key: '', value: '', operation: 'set' }
  },
  QuestLink: {
    category: 'system', label: 'Quest Link', icon: Link2,
    desc: '다른 퀘스트 발동', inPins: 1, outPins: 1,
    defaults: { target_quest: '', link_type: 'activate', pass_facts: [] }
  }
};

const CATEGORY_STYLES = {
  flow:      { bg: '#3d2a55', border: '#a78bfa', accent: '#c4b5fd', name: '흐름 제어' },
  objective: { bg: '#0f3d3a', border: '#5eead4', accent: '#99f6e4', name: '목표' },
  content:   { bg: '#4a2018', border: '#fb7185', accent: '#fda4af', name: '콘텐츠' },
  system:    { bg: '#4a3014', border: '#fbbf24', accent: '#fcd34d', name: '시스템' }
};

// Mock Fact registry
const FACT_REGISTRY = [
  { key: 'kill_count_frog',         type: 'int',  category: '전투', owner: 'combat',    desc: '개구리 처치 수' },
  { key: 'kill_count_geowa',        type: 'int',  category: '전투', owner: 'combat',    desc: '거와 처치 수' },
  { key: 'item_count_rainbow_dust', type: 'int',  category: '아이템', owner: 'inventory', desc: '무지개 가루 보유' },
  { key: 'item_count_water',        type: 'int',  category: '아이템', owner: 'inventory', desc: '폭포수 보유' },
  { key: 'talked_to_jui',           type: 'bool', category: 'NPC',  owner: 'dialogue',  desc: '주이와 대화 여부' },
  { key: 'talked_to_dongi',         type: 'bool', category: 'NPC',  owner: 'dialogue',  desc: '동이와 대화 여부' },
  { key: 'q_rainbow_pre_completed_frog',  type: 'bool', category: '퀘스트', owner: 'quest', desc: '개구리 사전 처치' },
  { key: 'q_rainbow_pre_completed_water', type: 'bool', category: '퀘스트', owner: 'quest', desc: '물 사전 습득' },
  { key: 'q_rainbow_ending',        type: 'enum', category: '퀘스트', owner: 'quest',     desc: '무지개 호수 결말' }
];

// =========================================================
//  SAMPLE QUEST DATA
// =========================================================
const buildSampleQuest = () => {
  const id = (() => { let n = 0; return () => `n${++n}`; })();
  const make = (type, x, y, props = {}) => ({
    id: id(), type, x, y,
    props: { ...NODE_TYPES[type].defaults, ...props }
  });
  const nodes = [
    make('Start', 60, 280, { activation_condition: 'player_meet_jui', priority: 1 }),
    make('Phase', 240, 280, {
      objective_text: '주이와 대화',
      goal_type: 'interact',
      target_tag: 'NPC_0001',
      hints: ['주이는 무지개 호수 근처에 있음'],
      journal_entry: 'jui_first_talk'
    }),
    make('PhaseGroup', 440, 280, { policy: 'ALL' }),
    make('Phase', 600, 170, {
      objective_text: '개구리 처치',
      goal_type: 'kill_count',
      target_tag: 'MON_0001',
      count: 10,
      hints: ['연못가에 개구리들이 모여있음', '비 오는 날 더 많이 출현'],
      alt_completion_facts: ['kill_count_frog>=10']
    }),
    make('Phase', 600, 400, {
      objective_text: '폭포 아래에서 물 퍼오기',
      goal_type: 'interact',
      target_tag: 'EV_0001',
      interaction_type: 'collect',
      prompt_text: '물 퍼오기',
      hints: ['폭포 뒤편으로 진입 가능']
    }),
    make('Dialogue', 820, 280, {
      scene_asset: 'dlg_jui_after_collect',
      participants: ['NPC_0001'],
      camera_mode: 'over_shoulder',
      context_facts: ['q_rainbow_pre_completed_frog', 'q_rainbow_pre_completed_water']
    }),
    make('Phase', 1020, 280, {
      objective_text: '동이와 대화',
      goal_type: 'interact',
      target_tag: 'NPC_0002',
      hints: ['동이는 염색공방에 있음']
    }),
    make('Phase', 1220, 280, {
      objective_text: '거와 처치 + 무지개 가루 습득',
      goal_type: 'kill_and_collect',
      target_tag: 'MON_0002',
      item_id: 'ITEM_0001',
      count: 3,
      hints: ['거와는 동굴 깊은 곳에 서식', '드롭률 약 30%']
    }),
    make('Reward', 1420, 280, { xp: 500, gold: 200, items: [{ id: 'ITEM_0002', count: 1 }] }),
    make('FactSet', 1580, 280, { fact_key: 'q_rainbow_ending', value: 'A', operation: 'set' }),
    make('End', 1740, 280, { ending_tag: 'A', result_type: 'success' })
  ];
  const edges = [
    { from: nodes[0].id, fromPin: 0, to: nodes[1].id, toPin: 0 },
    { from: nodes[1].id, fromPin: 0, to: nodes[2].id, toPin: 0 },
    { from: nodes[2].id, fromPin: 0, to: nodes[3].id, toPin: 0 },
    { from: nodes[2].id, fromPin: 0, to: nodes[4].id, toPin: 0 },
    { from: nodes[3].id, fromPin: 0, to: nodes[5].id, toPin: 0 },
    { from: nodes[4].id, fromPin: 0, to: nodes[5].id, toPin: 0 },
    { from: nodes[5].id, fromPin: 0, to: nodes[6].id, toPin: 0 },
    { from: nodes[6].id, fromPin: 0, to: nodes[7].id, toPin: 0 },
    { from: nodes[7].id, fromPin: 0, to: nodes[8].id, toPin: 0 },
    { from: nodes[8].id, fromPin: 0, to: nodes[9].id, toPin: 0 },
    { from: nodes[9].id, fromPin: 0, to: nodes[10].id, toPin: 0 }
  ];
  // PhaseGroup membership (visual dotted container)
  const groups = [
    { id: 'g1', groupNodeId: nodes[2].id, memberIds: [nodes[3].id, nodes[4].id] }
  ];
  return { nodes, edges, groups };
};

// =========================================================
//  NODE COMPONENT
// =========================================================
const NODE_W = 168;
const NODE_H = 88;

function NodeView({ node, selected, onMouseDownNode, onPinMouseDown, onPinMouseUp, onDoubleClick }) {
  const def = NODE_TYPES[node.type];
  const style = CATEGORY_STYLES[def.category];
  const Icon = def.icon;

  return (
    <div
      onMouseDown={(e) => onMouseDownNode(e, node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: NODE_W,
        minHeight: NODE_H,
        background: `linear-gradient(160deg, ${style.bg} 0%, ${style.bg}dd 100%)`,
        border: `1px solid ${selected ? style.accent : style.border}`,
        borderRadius: 6,
        color: '#f4f1ea',
        fontFamily: '"IBM Plex Sans KR", "Inter", sans-serif',
        fontSize: 11,
        cursor: 'move',
        userSelect: 'none',
        boxShadow: selected
          ? `0 0 0 1px ${style.accent}, 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`
          : `0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
        transition: 'box-shadow 120ms ease'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px',
        borderBottom: `1px solid ${style.border}40`,
        background: `linear-gradient(180deg, ${style.border}22, transparent)`
      }}>
        <Icon size={12} color={style.accent} strokeWidth={2} />
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          letterSpacing: '0.08em',
          color: style.accent,
          textTransform: 'uppercase',
          fontWeight: 600
        }}>{def.label}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px 10px', fontSize: 11, color: '#d4cdbf', lineHeight: 1.35 }}>
        {nodeBodyText(node)}
      </div>

      {/* IN pins */}
      {def.inPins > 0 && (
        <div
          onMouseUp={(e) => { e.stopPropagation(); onPinMouseUp(node.id, 0, 'in'); }}
          style={{
            position: 'absolute', left: -7, top: NODE_H / 2 - 6,
            width: 13, height: 13, borderRadius: '50%',
            background: '#1a1814',
            border: `2px solid ${style.accent}`,
            cursor: 'crosshair'
          }}
        />
      )}

      {/* OUT pins */}
      {def.outPins === 1 && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); onPinMouseDown(e, node.id, 0); }}
          style={{
            position: 'absolute', right: -7, top: NODE_H / 2 - 6,
            width: 13, height: 13, borderRadius: '50%',
            background: '#1a1814',
            border: `2px solid ${style.accent}`,
            cursor: 'crosshair'
          }}
        />
      )}

      {def.outPins === 2 && (
        <>
          <div
            onMouseDown={(e) => { e.stopPropagation(); onPinMouseDown(e, node.id, 0); }}
            style={{
              position: 'absolute', right: -7, top: 28,
              width: 13, height: 13, borderRadius: '50%',
              background: '#1a1814',
              border: `2px solid #5eead4`,
              cursor: 'crosshair'
            }}
            title="TRUE"
          />
          <span style={{
            position: 'absolute', right: 10, top: 24, fontSize: 9,
            fontFamily: '"JetBrains Mono", monospace', color: '#5eead4'
          }}>T</span>
          <div
            onMouseDown={(e) => { e.stopPropagation(); onPinMouseDown(e, node.id, 1); }}
            style={{
              position: 'absolute', right: -7, bottom: 14,
              width: 13, height: 13, borderRadius: '50%',
              background: '#1a1814',
              border: `2px solid #fb7185`,
              cursor: 'crosshair'
            }}
            title="FALSE"
          />
          <span style={{
            position: 'absolute', right: 10, bottom: 16, fontSize: 9,
            fontFamily: '"JetBrains Mono", monospace', color: '#fb7185'
          }}>F</span>
        </>
      )}
    </div>
  );
}

function nodeBodyText(node) {
  const p = node.props;
  switch (node.type) {
    case 'Start': return p.activation_condition || '진입 조건 없음';
    case 'End': return `결말 ${p.ending_tag} · ${p.result_type}`;
    case 'Condition': return p.fact_key ? `${p.fact_key} ${p.operator} ${p.compare_value}` : '조건 미설정';
    case 'Wait': return p.wait_type === 'timer' ? `타이머 ${p.duration_sec}초` : `감시: ${p.watch_fact || '?'}`;
    case 'Phase': return p.objective_text || '(목표 미설정)';
    case 'PhaseGroup': return `정책: ${p.policy}`;
    case 'Dialogue': return p.scene_asset || '(대화 에셋 미설정)';
    case 'Cutscene': return p.sequence_asset || '(컷신 미설정)';
    case 'Action': return p.action_type;
    case 'Reward': return `XP ${p.xp} · ${p.gold}G${p.items?.length ? ` · ${p.items.length}item` : ''}`;
    case 'FactSet': return p.fact_key ? `${p.fact_key} ${p.operation} ${p.value}` : '(미설정)';
    case 'QuestLink': return p.target_quest || '(대상 퀘스트 미설정)';
    default: return '';
  }
}

// =========================================================
//  PROPERTY PANEL
// =========================================================
function PropertyPanel({ node, onChange, onDelete }) {
  if (!node) {
    return (
      <div style={{ padding: 18, color: '#7a7468', fontSize: 12, lineHeight: 1.7 }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.18em',
          color: '#a89a7a', marginBottom: 14, textTransform: 'uppercase'
        }}>INSPECTOR</div>
        노드를 선택하면 속성을 편집할 수 있습니다.
        <div style={{ marginTop: 28, padding: 12, background: '#1a1814', border: '1px solid #2a2620', borderRadius: 4, fontSize: 10.5, lineHeight: 1.6 }}>
          <div style={{ color: '#c4b5fd', marginBottom: 6, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em' }}>TIP</div>
          좌측 팔레트에서 노드를 캔버스로 드래그하세요. 노드 우측의 핀에서 다른 노드의 좌측 핀으로 드래그하면 연결됩니다.
        </div>
      </div>
    );
  }

  const def = NODE_TYPES[node.type];
  const style = CATEGORY_STYLES[def.category];
  const update = (key, val) => onChange(node.id, { ...node.props, [key]: val });

  return (
    <div style={{ padding: 18, fontSize: 12, color: '#d4cdbf' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10, letterSpacing: '0.18em',
            color: style.accent, textTransform: 'uppercase'
          }}>{def.label}</div>
          <div style={{ fontSize: 10, color: '#7a7468', marginTop: 2 }}>{def.desc}</div>
        </div>
        <button onClick={() => onDelete(node.id)} style={iconBtn}><Trash2 size={13} /></button>
      </div>

      <div style={{ borderTop: '1px solid #2a2620', paddingTop: 14 }}>
        {renderProperties(node, update)}
      </div>

      <div style={{ marginTop: 18, padding: 10, background: '#13110e', border: '1px solid #25221d', borderRadius: 3 }}>
        <div style={{ fontSize: 9.5, color: '#7a7468', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>ID</div>
        <div style={{ fontSize: 11, color: '#a89a7a', fontFamily: '"JetBrains Mono", monospace', marginTop: 3 }}>{node.id}</div>
      </div>
    </div>
  );
}

const iconBtn = {
  background: 'transparent',
  border: '1px solid #3a342c',
  color: '#a89a7a',
  padding: '5px 7px',
  borderRadius: 3,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center'
};

const inputStyle = {
  width: '100%',
  background: '#13110e',
  border: '1px solid #2a2620',
  color: '#e8e1d0',
  padding: '6px 8px',
  fontSize: 11,
  fontFamily: '"JetBrains Mono", monospace',
  borderRadius: 3,
  outline: 'none',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  fontSize: 9.5,
  color: '#7a7468',
  fontFamily: '"JetBrains Mono", monospace',
  letterSpacing: '0.08em',
  marginBottom: 4,
  marginTop: 12,
  textTransform: 'uppercase'
};

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function renderProperties(node, update) {
  const p = node.props;
  switch (node.type) {
    case 'Start':
      return (
        <>
          <Field label="Activation Condition (Fact)">
            <select style={inputStyle} value={p.activation_condition} onChange={(e) => update('activation_condition', e.target.value)}>
              <option value="">(없음 · 즉시 활성)</option>
              {FACT_REGISTRY.map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <input type="number" style={inputStyle} value={p.priority} onChange={(e) => update('priority', Number(e.target.value))} />
          </Field>
          <Field label="HUD 추적 기본값">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#d4cdbf' }}>
              <input type="checkbox" checked={p.is_tracked} onChange={(e) => update('is_tracked', e.target.checked)} />
              is_tracked
            </label>
          </Field>
        </>
      );
    case 'End':
      return (
        <>
          <Field label="Ending Tag">
            <input style={inputStyle} value={p.ending_tag} onChange={(e) => update('ending_tag', e.target.value)} />
          </Field>
          <Field label="Result Type">
            <select style={inputStyle} value={p.result_type} onChange={(e) => update('result_type', e.target.value)}>
              <option value="success">success</option>
              <option value="fail">fail</option>
              <option value="partial">partial</option>
            </select>
          </Field>
          <Field label="On-End Facts (배열)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={(p.on_end_facts || []).join('\n')} onChange={(e) => update('on_end_facts', e.target.value.split('\n').filter(Boolean))} placeholder="한 줄에 하나씩" />
          </Field>
        </>
      );
    case 'Condition':
      return (
        <>
          <Field label="Fact Key">
            <select style={inputStyle} value={p.fact_key} onChange={(e) => update('fact_key', e.target.value)}>
              <option value="">(선택)</option>
              {FACT_REGISTRY.map(f => <option key={f.key} value={f.key}>{f.key} · {f.category}</option>)}
            </select>
          </Field>
          <Field label="Operator">
            <select style={inputStyle} value={p.operator} onChange={(e) => update('operator', e.target.value)}>
              {['==', '!=', '>', '<', '>=', '<='].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Compare Value">
            <input style={inputStyle} value={p.compare_value} onChange={(e) => update('compare_value', e.target.value)} />
          </Field>
          <Field label="Description (메모)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={p.description} onChange={(e) => update('description', e.target.value)} />
          </Field>
        </>
      );
    case 'Wait':
      return (
        <>
          <Field label="Wait Type">
            <select style={inputStyle} value={p.wait_type} onChange={(e) => update('wait_type', e.target.value)}>
              <option value="timer">timer</option>
              <option value="fact_change">fact_change</option>
            </select>
          </Field>
          {p.wait_type === 'timer' && (
            <Field label="Duration (초)">
              <input type="number" step="0.1" style={inputStyle} value={p.duration_sec} onChange={(e) => update('duration_sec', Number(e.target.value))} />
            </Field>
          )}
          {p.wait_type === 'fact_change' && (
            <Field label="Watch Fact">
              <select style={inputStyle} value={p.watch_fact} onChange={(e) => update('watch_fact', e.target.value)}>
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
            <input style={inputStyle} value={p.objective_text} onChange={(e) => update('objective_text', e.target.value)} placeholder="넓은 범위로 작성" />
          </Field>
          <Field label="Goal Type">
            <select style={inputStyle} value={p.goal_type} onChange={(e) => update('goal_type', e.target.value)}>
              <option value="kill_count">kill_count</option>
              <option value="item_collect">item_collect</option>
              <option value="area_reach">area_reach</option>
              <option value="interact">interact</option>
              <option value="kill_and_collect">kill_and_collect</option>
              <option value="sequence_interact">sequence_interact</option>
              <option value="custom">custom</option>
            </select>
          </Field>

          {(p.goal_type === 'kill_count') && (
            <>
              <Field label="대상 태그"><input style={inputStyle} value={p.target_tag} onChange={(e) => update('target_tag', e.target.value)} /></Field>
              <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={(e) => update('count', Number(e.target.value))} /></Field>
            </>
          )}
          {p.goal_type === 'item_collect' && (
            <>
              <Field label="Item ID"><input style={inputStyle} value={p.item_id} onChange={(e) => update('item_id', e.target.value)} /></Field>
              <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={(e) => update('count', Number(e.target.value))} /></Field>
            </>
          )}
          {p.goal_type === 'area_reach' && (
            <Field label="트리거 태그"><input style={inputStyle} value={p.trigger_tag} onChange={(e) => update('trigger_tag', e.target.value)} /></Field>
          )}
          {p.goal_type === 'interact' && (
            <>
              <Field label="대상 태그"><input style={inputStyle} value={p.target_tag} onChange={(e) => update('target_tag', e.target.value)} /></Field>
              <Field label="상호작용 유형">
                <select style={inputStyle} value={p.interaction_type} onChange={(e) => update('interaction_type', e.target.value)}>
                  <option value="use">use</option>
                  <option value="collect">collect</option>
                  <option value="talk">talk</option>
                  <option value="examine">examine</option>
                </select>
              </Field>
              <Field label="프롬프트 텍스트"><input style={inputStyle} value={p.prompt_text} onChange={(e) => update('prompt_text', e.target.value)} /></Field>
            </>
          )}
          {p.goal_type === 'kill_and_collect' && (
            <>
              <Field label="대상 태그"><input style={inputStyle} value={p.target_tag} onChange={(e) => update('target_tag', e.target.value)} /></Field>
              <Field label="Item ID"><input style={inputStyle} value={p.item_id} onChange={(e) => update('item_id', e.target.value)} /></Field>
              <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={(e) => update('count', Number(e.target.value))} /></Field>
            </>
          )}
          {p.goal_type === 'sequence_interact' && (
            <>
              <Field label="Targets (순서대로)">
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={(p.targets || []).join('\n')} onChange={(e) => update('targets', e.target.value.split('\n').filter(Boolean))} placeholder="한 줄에 하나씩" />
              </Field>
              <Field label="잘못된 순서 시">
                <select style={inputStyle} value={p.on_wrong_order} onChange={(e) => update('on_wrong_order', e.target.value)}>
                  <option value="reset">reset</option>
                  <option value="ignore">ignore</option>
                  <option value="fail">fail</option>
                </select>
              </Field>
            </>
          )}
          {p.goal_type === 'custom' && (
            <>
              <Field label="Function ID"><input style={inputStyle} value={p.function_id} onChange={(e) => update('function_id', e.target.value)} /></Field>
              <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={p.description} onChange={(e) => update('description', e.target.value)} /></Field>
            </>
          )}

          <Field label="Hints (목표 달성 단서)">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={(p.hints || []).join('\n')} onChange={(e) => update('hints', e.target.value.split('\n').filter(Boolean))} placeholder="한 줄에 하나씩" />
          </Field>
          <Field label="Alt Completion Facts (대체 완료 조건)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={(p.alt_completion_facts || []).join('\n')} onChange={(e) => update('alt_completion_facts', e.target.value.split('\n').filter(Boolean))} placeholder="예: kill_count_frog>=10" />
          </Field>
          <Field label="Journal Entry"><input style={inputStyle} value={p.journal_entry} onChange={(e) => update('journal_entry', e.target.value)} /></Field>
          <Field label="선택적 목표">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <input type="checkbox" checked={p.is_optional} onChange={(e) => update('is_optional', e.target.checked)} />
              is_optional
            </label>
          </Field>
        </>
      );
    case 'PhaseGroup':
      return (
        <Field label="Policy">
          <select style={inputStyle} value={p.policy} onChange={(e) => update('policy', e.target.value)}>
            <option value="ALL">ALL · 모두 완료 시 진행</option>
            <option value="ANY">ANY · 하나만 완료되면 진행</option>
          </select>
        </Field>
      );
    case 'Dialogue':
      return (
        <>
          <Field label="Scene Asset"><input style={inputStyle} value={p.scene_asset} onChange={(e) => update('scene_asset', e.target.value)} /></Field>
          <Field label="Participants (NPC 태그)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={(p.participants || []).join('\n')} onChange={(e) => update('participants', e.target.value.split('\n').filter(Boolean))} />
          </Field>
          <Field label="Camera Mode">
            <select style={inputStyle} value={p.camera_mode} onChange={(e) => update('camera_mode', e.target.value)}>
              <option value="close_up">close_up</option>
              <option value="over_shoulder">over_shoulder</option>
              <option value="free">free</option>
            </select>
          </Field>
          <Field label="Context Facts (대화 진입 시 참조)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={(p.context_facts || []).join('\n')} onChange={(e) => update('context_facts', e.target.value.split('\n').filter(Boolean))} />
          </Field>
        </>
      );
    case 'Cutscene':
      return (
        <>
          <Field label="Sequence Asset"><input style={inputStyle} value={p.sequence_asset} onChange={(e) => update('sequence_asset', e.target.value)} /></Field>
          <Field label="스킵 가능">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <input type="checkbox" checked={p.skippable} onChange={(e) => update('skippable', e.target.checked)} />
              skippable
            </label>
          </Field>
          <Field label="On-Skip Fact">
            <select style={inputStyle} value={p.on_skip_fact} onChange={(e) => update('on_skip_fact', e.target.value)}>
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
            <select style={inputStyle} value={p.action_type} onChange={(e) => update('action_type', e.target.value)}>
              <option value="npc_state_change">npc_state_change</option>
              <option value="spawn">spawn</option>
              <option value="object_toggle">object_toggle</option>
              <option value="weather_change">weather_change</option>
              <option value="bgm_play">bgm_play</option>
              <option value="custom">custom</option>
            </select>
          </Field>
          {p.action_type === 'npc_state_change' && (
            <>
              <Field label="NPC 태그"><input style={inputStyle} value={p.npc_tag} onChange={(e) => update('npc_tag', e.target.value)} /></Field>
              <Field label="상태값"><input style={inputStyle} value={p.state_value} onChange={(e) => update('state_value', e.target.value)} placeholder="예: walk, attack, flee" /></Field>
            </>
          )}
          {p.action_type === 'spawn' && (
            <>
              <Field label="스포너 태그"><input style={inputStyle} value={p.spawner_tag} onChange={(e) => update('spawner_tag', e.target.value)} /></Field>
              <Field label="프리셋"><input style={inputStyle} value={p.preset} onChange={(e) => update('preset', e.target.value)} /></Field>
              <Field label="수량"><input type="number" style={inputStyle} value={p.count} onChange={(e) => update('count', Number(e.target.value))} /></Field>
              <Field label="실패 시 제거">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <input type="checkbox" checked={p.remove_on_fail} onChange={(e) => update('remove_on_fail', e.target.checked)} />
                  remove_on_fail
                </label>
              </Field>
            </>
          )}
          {p.action_type === 'object_toggle' && (
            <>
              <Field label="오브젝트 태그"><input style={inputStyle} value={p.object_tag} onChange={(e) => update('object_tag', e.target.value)} /></Field>
              <Field label="활성화">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <input type="checkbox" checked={p.enabled} onChange={(e) => update('enabled', e.target.checked)} />
                  enabled
                </label>
              </Field>
            </>
          )}
          {p.action_type === 'weather_change' && (
            <Field label="날씨 프리셋">
              <select style={inputStyle} value={p.weather_preset} onChange={(e) => update('weather_preset', e.target.value)}>
                <option value="clear">clear</option><option value="rain">rain</option>
                <option value="storm">storm</option><option value="snow">snow</option>
                <option value="fog">fog</option>
              </select>
            </Field>
          )}
          {p.action_type === 'bgm_play' && (
            <Field label="사운드 에셋"><input style={inputStyle} value={p.sound_asset} onChange={(e) => update('sound_asset', e.target.value)} /></Field>
          )}
          {p.action_type === 'custom' && (
            <>
              <Field label="Function ID"><input style={inputStyle} value={p.function_id} onChange={(e) => update('function_id', e.target.value)} /></Field>
              <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={p.description} onChange={(e) => update('description', e.target.value)} /></Field>
            </>
          )}
        </>
      );
    case 'Reward':
      return (
        <>
          <Field label="XP"><input type="number" style={inputStyle} value={p.xp} onChange={(e) => update('xp', Number(e.target.value))} /></Field>
          <Field label="Gold"><input type="number" style={inputStyle} value={p.gold} onChange={(e) => update('gold', Number(e.target.value))} /></Field>
          <Field label="Items (id:count, 줄바꿈 구분)">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={(p.items || []).map(it => `${it.id}:${it.count}`).join('\n')}
              onChange={(e) => update('items', e.target.value.split('\n').filter(Boolean).map(line => {
                const [id, count] = line.split(':');
                return { id: id?.trim() || '', count: Number(count) || 1 };
              }))}
              placeholder="ITEM_0001:1" />
          </Field>
          <Field label="레벨 스케일링">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <input type="checkbox" checked={p.scale_to_level} onChange={(e) => update('scale_to_level', e.target.checked)} />
              scale_to_level
            </label>
          </Field>
        </>
      );
    case 'FactSet':
      return (
        <>
          <Field label="Fact Key (쓰기 권한 있는 것만)">
            <select style={inputStyle} value={p.fact_key} onChange={(e) => update('fact_key', e.target.value)}>
              <option value="">(선택)</option>
              {FACT_REGISTRY.filter(f => f.owner === 'quest').map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
            </select>
          </Field>
          <Field label="Operation">
            <select style={inputStyle} value={p.operation} onChange={(e) => update('operation', e.target.value)}>
              <option value="set">set</option>
              <option value="add">add</option>
              <option value="subtract">subtract</option>
            </select>
          </Field>
          <Field label="Value"><input style={inputStyle} value={p.value} onChange={(e) => update('value', e.target.value)} /></Field>
        </>
      );
    case 'QuestLink':
      return (
        <>
          <Field label="Target Quest"><input style={inputStyle} value={p.target_quest} onChange={(e) => update('target_quest', e.target.value)} placeholder="예: q_rainbow_princess_route" /></Field>
          <Field label="Link Type">
            <select style={inputStyle} value={p.link_type} onChange={(e) => update('link_type', e.target.value)}>
              <option value="activate">activate</option>
              <option value="fail">fail</option>
              <option value="complete">complete</option>
            </select>
          </Field>
          <Field label="Pass Facts (넘겨줄 컨텍스트)">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={(p.pass_facts || []).join('\n')} onChange={(e) => update('pass_facts', e.target.value.split('\n').filter(Boolean))} />
          </Field>
        </>
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
  // out
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
  const initial = buildSampleQuest();
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const [groups] = useState(initial.groups);
  const [selectedId, setSelectedId] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.85);
  const [isPanning, setIsPanning] = useState(false);
  const [dragNode, setDragNode] = useState(null); // {id, offsetX, offsetY}
  const [pendingEdge, setPendingEdge] = useState(null); // {from, fromPin, x, y}
  const [toast, setToast] = useState(null);
  const canvasRef = useRef(null);
  const idCounter = useRef(100);

  // Toast
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // Pan with middle/space drag
  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.dataset.bg === '1') {
      setSelectedId(null);
      if (e.button === 1 || e.shiftKey) {
        setIsPanning(true);
      }
    }
  };

  // Node drag
  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    setSelectedId(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top - pan.y) / zoom;
    setDragNode({ id: nodeId, offsetX: mx - node.x, offsetY: my - node.y });
  };

  // Pin: start edge
  const handlePinMouseDown = (e, nodeId, pinIdx) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top - pan.y) / zoom;
    setPendingEdge({ from: nodeId, fromPin: pinIdx, x: mx, y: my });
  };

  // Pin: end edge (drop on IN pin)
  const handlePinMouseUp = (nodeId, pinIdx, side) => {
    if (pendingEdge && side === 'in' && pendingEdge.from !== nodeId) {
      const exists = edges.find(e => e.from === pendingEdge.from && e.fromPin === pendingEdge.fromPin && e.to === nodeId);
      if (!exists) {
        setEdges(prev => [...prev, { from: pendingEdge.from, fromPin: pendingEdge.fromPin, to: nodeId, toPin: pinIdx }]);
      }
    }
    setPendingEdge(null);
  };

  // Mouse move (global)
  useEffect(() => {
    const onMove = (e) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      if (isPanning) {
        setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
        return;
      }
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
    const onUp = () => {
      setIsPanning(false);
      setDragNode(null);
      setPendingEdge(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning, dragNode, pendingEdge, pan, zoom]);

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const dz = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(1.6, z * dz)));
  };

  // Palette: add new node
  const addNode = (type) => {
    idCounter.current += 1;
    const newNode = {
      id: `n${idCounter.current}`,
      type,
      x: (-pan.x + 400) / zoom,
      y: (-pan.y + 200) / zoom,
      props: { ...NODE_TYPES[type].defaults }
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedId(newNode.id);
  };

  const updateNodeProps = (id, props) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, props } : n));
  };

  const deleteNode = (id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    setSelectedId(null);
  };

  // Group bounding boxes
  const groupBoxes = groups.map(g => {
    const members = nodes.filter(n => g.memberIds.includes(n.id));
    if (members.length === 0) return null;
    const xs = members.map(n => n.x);
    const ys = members.map(n => n.y);
    const minX = Math.min(...xs) - 16;
    const minY = Math.min(...ys) - 24;
    const maxX = Math.max(...xs) + NODE_W + 16;
    const maxY = Math.max(...ys) + NODE_H + 16;
    return { id: g.id, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }).filter(Boolean);

  const selectedNode = nodes.find(n => n.id === selectedId);

  // Group palette
  const palette = [
    { cat: 'flow', items: ['Start', 'End', 'Condition', 'Wait'] },
    { cat: 'objective', items: ['Phase', 'PhaseGroup'] },
    { cat: 'content', items: ['Dialogue', 'Cutscene'] },
    { cat: 'system', items: ['Action', 'Reward', 'FactSet', 'QuestLink'] }
  ];

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0f0d0a',
      color: '#e8e1d0',
      fontFamily: '"IBM Plex Sans KR", "Inter", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet" />

      {/* ============ TOP BAR ============ */}
      <div style={{
        height: 52,
        background: 'linear-gradient(180deg, #1a1814 0%, #15130f 100%)',
        borderBottom: '1px solid #2a2620',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{
            fontFamily: '"Cormorant Garamond", serif',
            fontSize: 22, fontWeight: 600, color: '#e8e1d0',
            letterSpacing: '-0.01em'
          }}>Quest Forge</span>
          <span style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
            color: '#7a7468', letterSpacing: '0.15em'
          }}>v0.1 · PORTFOLIO DEMO</span>
        </div>

        <div style={{ width: 1, height: 24, background: '#2a2620', margin: '0 4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#a89a7a' }}>
          <FileCode size={13} />
          <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>quest_rainbow_lake.qgraph</span>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => showToast('Save · 데모 버전에서는 저장되지 않습니다')} style={toolBtn}>
          <Save size={13} /> Save
        </button>
        <button onClick={() => showToast('Export · 데모 버전에서는 추출되지 않습니다')} style={toolBtn}>
          <Download size={13} /> Export XLSX
        </button>
      </div>

      {/* ============ MAIN AREA ============ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* === LEFT PALETTE === */}
        <div style={{
          width: 200,
          background: '#13110e',
          borderRight: '1px solid #25221d',
          padding: '16px 12px',
          overflowY: 'auto',
          flexShrink: 0
        }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10, letterSpacing: '0.18em',
            color: '#7a7468', marginBottom: 12, textTransform: 'uppercase'
          }}>NODE PALETTE</div>

          {palette.map(group => {
            const style = CATEGORY_STYLES[group.cat];
            return (
              <div key={group.cat} style={{ marginBottom: 18 }}>
                <div style={{
                  fontSize: 10,
                  color: style.accent,
                  marginBottom: 6,
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <span style={{ width: 6, height: 6, background: style.border, borderRadius: 1 }} />
                  {style.name}
                </div>
                {group.items.map(t => {
                  const def = NODE_TYPES[t];
                  const Icon = def.icon;
                  return (
                    <button
                      key={t}
                      onClick={() => addNode(t)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: '#1a1814',
                        border: `1px solid ${style.border}33`,
                        color: '#d4cdbf',
                        padding: '7px 9px',
                        marginBottom: 4,
                        borderRadius: 3,
                        cursor: 'pointer',
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontFamily: 'inherit',
                        transition: 'all 120ms ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = style.bg;
                        e.currentTarget.style.borderColor = style.border;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#1a1814';
                        e.currentTarget.style.borderColor = `${style.border}33`;
                      }}
                    >
                      <Icon size={12} color={style.accent} />
                      <span>{def.label}</span>
                      <Plus size={11} style={{ marginLeft: 'auto', color: '#7a7468' }} />
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div style={{
            marginTop: 24,
            padding: 11,
            background: '#0a0907',
            border: '1px solid #25221d',
            borderRadius: 3,
            fontSize: 10,
            lineHeight: 1.7,
            color: '#7a7468'
          }}>
            <div style={{
              color: '#a89a7a', fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.1em', marginBottom: 5, fontSize: 9.5
            }}>SHORTCUTS</div>
            <div>· Drag · 노드 이동</div>
            <div>· Pin → Pin · 연결</div>
            <div>· Scroll · 줌</div>
            <div>· Shift+Drag · 화면 이동</div>
          </div>
        </div>

        {/* === CANVAS === */}
        <div
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleWheel}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: `
              radial-gradient(circle at 20% 30%, rgba(94, 234, 212, 0.025), transparent 50%),
              radial-gradient(circle at 80% 70%, rgba(167, 139, 250, 0.025), transparent 50%),
              #0a0907
            `,
            cursor: isPanning ? 'grabbing' : 'default'
          }}
        >
          {/* Grid background */}
          <div
            data-bg="1"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(120, 110, 90, 0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(120, 110, 90, 0.04) 1px, transparent 1px),
                linear-gradient(rgba(120, 110, 90, 0.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(120, 110, 90, 0.08) 1px, transparent 1px)
              `,
              backgroundSize: `
                ${20 * zoom}px ${20 * zoom}px,
                ${20 * zoom}px ${20 * zoom}px,
                ${100 * zoom}px ${100 * zoom}px,
                ${100 * zoom}px ${100 * zoom}px
              `,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
              pointerEvents: 'none'
            }}
          />

          {/* Transformed world */}
          <div
            style={{
              position: 'absolute',
              left: pan.x,
              top: pan.y,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              width: 1,
              height: 1
            }}
          >
            {/* Phase Group containers (dotted) */}
            {groupBoxes.map(g => (
              <div
                key={g.id}
                style={{
                  position: 'absolute',
                  left: g.x, top: g.y, width: g.w, height: g.h,
                  border: '1.5px dashed #5eead499',
                  borderRadius: 8,
                  background: 'rgba(94, 234, 212, 0.025)',
                  pointerEvents: 'none'
                }}
              >
                <div style={{
                  position: 'absolute', top: -10, left: 12,
                  background: '#0a0907',
                  padding: '0 8px',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9, letterSpacing: '0.15em',
                  color: '#5eead4'
                }}>
                  PARALLEL · ALL
                </div>
              </div>
            ))}

            {/* Edges */}
            <svg
              style={{
                position: 'absolute',
                left: -2000, top: -2000,
                width: 6000, height: 6000,
                pointerEvents: 'none',
                overflow: 'visible'
              }}
            >
              <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                  <path d="M0,0 L0,10 L9,5 z" fill="#a89a7a" />
                </marker>
                <marker id="arrow-true" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                  <path d="M0,0 L0,10 L9,5 z" fill="#5eead4" />
                </marker>
                <marker id="arrow-false" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                  <path d="M0,0 L0,10 L9,5 z" fill="#fb7185" />
                </marker>
              </defs>
              <g transform="translate(2000, 2000)">
                {edges.map((edge, i) => {
                  const from = nodes.find(n => n.id === edge.from);
                  const to = nodes.find(n => n.id === edge.to);
                  if (!from || !to) return null;
                  const fp = getPinPos(from, 'out', edge.fromPin);
                  const tp = getPinPos(to, 'in', 0);
                  const fromDef = NODE_TYPES[from.type];
                  let color = '#a89a7a';
                  let marker = 'arrow';
                  if (fromDef.outPins === 2) {
                    if (edge.fromPin === 0) { color = '#5eead4'; marker = 'arrow-true'; }
                    else { color = '#fb7185'; marker = 'arrow-false'; }
                  }
                  return (
                    <path
                      key={i}
                      d={bezierPath(fp.x, fp.y, tp.x - 4, tp.y)}
                      stroke={color}
                      strokeWidth="1.5"
                      fill="none"
                      opacity="0.85"
                      markerEnd={`url(#${marker})`}
                    />
                  );
                })}
                {pendingEdge && (() => {
                  const from = nodes.find(n => n.id === pendingEdge.from);
                  if (!from) return null;
                  const fp = getPinPos(from, 'out', pendingEdge.fromPin);
                  return (
                    <path
                      d={bezierPath(fp.x, fp.y, pendingEdge.x, pendingEdge.y)}
                      stroke="#e8e1d0"
                      strokeWidth="1.5"
                      strokeDasharray="5 4"
                      fill="none"
                      opacity="0.7"
                    />
                  );
                })()}
              </g>
            </svg>

            {/* Nodes */}
            {nodes.map(node => (
              <NodeView
                key={node.id}
                node={node}
                selected={node.id === selectedId}
                onMouseDownNode={handleNodeMouseDown}
                onPinMouseDown={handlePinMouseDown}
                onPinMouseUp={handlePinMouseUp}
                onDoubleClick={(id) => setSelectedId(id)}
              />
            ))}
          </div>

          {/* Zoom indicator */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            padding: '6px 11px',
            background: '#1a1814cc',
            backdropFilter: 'blur(8px)',
            border: '1px solid #2a2620',
            borderRadius: 3,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            color: '#a89a7a',
            letterSpacing: '0.06em'
          }}>
            {Math.round(zoom * 100)}% · {nodes.length} nodes · {edges.length} edges
          </div>

          {/* Minimap-like quest title overlay */}
          <div style={{
            position: 'absolute', top: 16, right: 16,
            padding: '10px 14px',
            background: '#1a1814cc',
            backdropFilter: 'blur(8px)',
            border: '1px solid #2a2620',
            borderRadius: 3,
            maxWidth: 280
          }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9, letterSpacing: '0.18em',
              color: '#7a7468', marginBottom: 4
            }}>QUEST</div>
            <div style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: 17, fontWeight: 600, color: '#e8e1d0',
              lineHeight: 1.2
            }}>무지개 호수</div>
            <div style={{
              fontSize: 10.5, color: '#a89a7a', marginTop: 4, lineHeight: 1.4
            }}>주이의 부탁으로 무지개를 만드는 재료를 모은다.</div>
          </div>
        </div>

        {/* === RIGHT INSPECTOR === */}
        <div style={{
          width: 320,
          background: '#13110e',
          borderLeft: '1px solid #25221d',
          overflowY: 'auto',
          flexShrink: 0
        }}>
          <PropertyPanel
            node={selectedNode}
            onChange={updateNodeProps}
            onDelete={deleteNode}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          background: '#1a1814',
          border: '1px solid #fbbf2455',
          borderLeft: '3px solid #fbbf24',
          color: '#fcd34d',
          padding: '10px 18px',
          fontSize: 12,
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '0.02em',
          borderRadius: 3,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 1000
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const toolBtn = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#1a1814',
  border: '1px solid #3a342c',
  color: '#d4cdbf',
  padding: '7px 13px',
  fontSize: 11.5,
  fontFamily: 'inherit',
  borderRadius: 3,
  cursor: 'pointer',
  letterSpacing: '0.02em'
};
