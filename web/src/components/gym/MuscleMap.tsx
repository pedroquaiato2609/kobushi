import { MUSCLE_VIEW, MUSCLE_ZONE, ZONE_LABEL, type Muscle, type Zone } from '../../lib/muscles';

// Desenho anatômico simplificado (metade direita; a esquerda é o espelho), por REGIÃO do corpo (13 regiões), não por
// músculo individual — um mapa com uma forma própria para cada um dos ~28 músculos específicos ficaria denso demais
// para ler num celular. O nome mostrado ao usuário é sempre o músculo específico (ver MUSCLE_LABEL); a região aqui é
// só o agrupamento visual do desenho (ver MUSCLE_ZONE). O mapa é gerado a partir dos músculos do exercício: a região
// fica no tom do músculo de maior destaque que ela contém (principal > secundário > estabilizador).
const FRONT: Partial<Record<Zone, string[]>> = {
  traps: ['M107 54 C118 56 128 60 134 68 C126 71 116 69 107 62 Z'],
  shoulders: ['M132 66 C145 66 154 75 153 89 C149 97 140 97 136 90 C131 82 130 74 132 66 Z'],
  chest: ['M101 73 C112 68 126 69 134 75 C136 89 130 102 118 106 C108 108 101 104 101 100 Z'],
  biceps: ['M140 98 C148 96 155 104 155 119 C155 131 151 139 146 141 C140 137 138 118 140 98 Z'],
  forearms: ['M146 146 C154 145 160 157 164 177 C166 191 168 205 168 215 L160 215 C156 197 150 173 146 146 Z'],
  abs: ['M101 108 h12 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 h-12 z', 'M101 124 h12 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 h-12 z', 'M101 140 h12 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 h-12 z', 'M101 156 h11 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-11 z'],
  quads: ['M102 204 C112 202 124 204 128 214 C131 250 127 276 121 298 C112 301 104 297 102 289 Z'],
  calves: ['M108 314 C114 312 122 314 124 322 C125 350 122 372 120 392 L110 392 C108 372 106 342 108 314 Z'],
};
const BACK: Partial<Record<Zone, string[]>> = {
  lats: ['M135 84 C139 102 132 130 118 146 C110 148 104 132 104 102 C118 102 129 94 135 84 Z'],
  traps: ['M101 52 C114 54 128 62 136 70 C130 80 118 92 101 100 Z'],
  shoulders: ['M132 66 C145 66 154 75 153 89 C149 97 140 97 136 90 C131 82 130 74 132 66 Z'],
  triceps: ['M140 98 C148 96 155 104 155 119 C155 131 151 139 146 141 C140 137 138 118 140 98 Z'],
  forearms: ['M146 146 C154 145 160 157 164 177 C166 191 168 205 168 215 L160 215 C156 197 150 173 146 146 Z'],
  lower_back: ['M101 148 C110 148 118 150 120 160 C119 171 110 177 101 177 Z'],
  glutes: ['M101 179 C112 177 126 181 128 197 C126 211 112 215 101 211 Z'],
  hamstrings: ['M102 216 C114 214 126 216 128 228 C131 256 127 282 121 300 C112 303 104 299 102 291 Z'],
  calves: ['M106 306 C114 304 124 308 124 321 C125 347 121 367 119 386 L110 386 C106 367 104 337 106 306 Z'],
};

// Silhueta (cabeça e pescoço fora do espelho; o resto é a metade direita espelhada).
const BODY_HALF = [
  'M100 56 L107 56 C122 58 138 62 142 74 L136 100 C132 120 130 150 126 172 C128 184 128 192 126 198 L100 204 Z', // tronco
  'M138 68 C150 70 158 80 156 100 L162 150 C166 175 170 200 172 216 L162 219 C158 200 150 172 144 150 L134 104 Z', // braço
  'M100 200 L126 198 C134 240 132 280 126 310 C124 340 124 372 122 398 L108 398 C106 372 104 340 102 310 Z', // perna
];

type Tone = 'primary' | 'secondary' | 'stabilizer' | 'idle';

function Figure({ shapes, tone, fills }: { shapes: Partial<Record<Zone, string[]>>; tone: (z: Zone) => Tone; fills?: Partial<Record<Zone, string>> }) {
  const draw = (mirror: boolean) => (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {BODY_HALF.map((d, i) => <path key={i} d={d} className="mm-body" />)}
      {(Object.keys(shapes) as Zone[]).map((z) => (
        <g key={z} className={`mm-muscle ${tone(z)}`}>
          <title>{ZONE_LABEL[z]}</title>
          {shapes[z]!.map((d, i) => <path key={i} d={d} style={fills?.[z] ? { fill: fills[z], filter: 'none' } : undefined} />)}
        </g>
      ))}
    </g>
  );
  return (
    <>
      <circle cx="100" cy="26" r="16" className="mm-body" />
      <path d="M93 40 L93 57 L107 57 L107 40 Z" className="mm-body" />
      {draw(false)}
      {draw(true)}
    </>
  );
}

const zonesOf = (muscles: Muscle[]) => new Set(muscles.map((m) => MUSCLE_ZONE[m]));

/**
 * Mapa muscular gerado a partir da classificação do exercício: `primary` (motor principal) em destaque, `secondary`
 * (participa ativamente) mais suave, `stabilizer` (segura postura/tronco) sutil. Cada músculo tinge a região do corpo
 * onde fica (ver MUSCLE_ZONE); uma região com músculos de mais de uma categoria mostra a de maior destaque.
 * Nada aqui depende de imagem externa.
 */
export function MuscleMap({ primary = [], secondary = [], stabilizer = [], view = 'both', className, fills }: {
  primary?: Muscle[]; secondary?: Muscle[]; stabilizer?: Muscle[]; view?: 'front' | 'back' | 'both'; className?: string;
  /** Cor própria por região (ex.: mapa de calor da recuperação); tem prioridade sobre principal/secundário/estabilizador. */
  fills?: Partial<Record<Zone, string>>;
}) {
  const pZones = zonesOf(primary), sZones = zonesOf(secondary), stZones = zonesOf(stabilizer);
  const tone = (z: Zone): Tone => (pZones.has(z) ? 'primary' : sZones.has(z) ? 'secondary' : stZones.has(z) ? 'stabilizer' : 'idle');
  const both = view === 'both';
  const label = (title: string, ms: Muscle[]) => (ms.length ? `${title}: ${ms.map((m) => m).join(', ')}` : '');
  const summary = [label('Principal', primary), label('Secundário', secondary), label('Estabilizador', stabilizer)].filter(Boolean).join('. ');
  return (
    <svg className={`muscle-map ${className ?? ''}`} viewBox={both ? '0 0 420 410' : '0 0 200 410'} role="img" aria-label={summary || 'Mapa muscular'}>
      {(both || view === 'front') && <g><Figure shapes={FRONT} tone={tone} fills={fills} /></g>}
      {(both || view === 'back') && <g transform={both ? 'translate(220 0)' : undefined}><Figure shapes={BACK} tone={tone} fills={fills} /></g>}
    </svg>
  );
}

/** Qual vista mostrar por padrão: a que contém mais dos músculos trabalhados (principal + secundário). */
export function bestView(muscles: Muscle[]): 'front' | 'back' | 'both' {
  const f = muscles.filter((m) => MUSCLE_VIEW[m].includes('front')).length;
  const b = muscles.filter((m) => MUSCLE_VIEW[m].includes('back')).length;
  return f && b ? 'both' : b ? 'back' : 'front';
}
