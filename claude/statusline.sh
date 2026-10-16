#!/usr/bin/env bash
# Línea de estado de Claude Code. Claude Code le manda por stdin un JSON con los
# datos de la sesión y muestra lo que este script imprima.
#
# Muestra: modelo · nombre de la sesión · carpeta · rama git · worktree · agente ·
#   esfuerzo · thinking · contexto % · caché · costo · líneas +/− · duración ·
#   límite de 5 h y semanal (con cuenta regresiva) · perfil de AWS · hora
#
# Funciona igual en macOS, Linux y Git Bash de Windows. Solo necesita jq (y git
# para la rama). Todos los números y fechas los calcula jq, así que no depende de
# `bc`, de `date -r` (que solo existe en macOS) ni del idioma del sistema: los días
# salen en español aunque no exista el locale es_MX.

entrada=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' "statusline: falta jq (macOS: brew install jq · Windows: winget install jqlang.jq)"
  exit 0
fi

# Un solo jq calcula todo (en Windows cada programa que se lanza cuesta tiempo).
# Devuelve líneas `variable='valor'` listas para eval; @sh pone las comillas.
datos=$(jq -r '
  def r: (. + 0.5 | floor);
  def dos: tostring | if length < 2 then "0" + . else . end;
  def dinero: (. * 100 | r) as $c | "\($c / 100 | floor).\($c % 100 | dos)";
  def falta: (. - now | floor) as $s
    | if $s <= 0 then "ya"
      else ($s / 86400 | floor) as $d | ($s % 86400 / 3600 | floor) as $h
        | ($s % 3600 / 60 | floor) as $m
        | if $d > 0 then "\($d)d\($h)h" elif $h > 0 then "\($h)h\($m)m" else "\($m)m" end
      end;
  def dia_hora: localtime as $t
    | (["dom","lun","mar","mié","jue","vie","sáb"][$t[6]]) + " \($t[3] | dos):\($t[4] | dos)";
  def num(f): if f == null then "" else f end;

  (.workspace.current_dir // .cwd // "") as $dir
  | {
      modelo: (.model.display_name // "?"),
      dir: $dir,
      carpeta: ($dir | gsub("\\\\"; "/") | split("/") | map(select(. != "")) | last // ""),
      esfuerzo: (.effort.level // ""),
      thinking: (if .thinking.enabled == true then "on"
                 elif .thinking.enabled == false then "off" else "" end),
      sesion: (.session_name // ""),
      worktree: (.worktree.name // .workspace.git_worktree // ""),
      agente: (.agent.name // ""),
      rapido: (if .fast_mode == true then "1" else "" end),
      ctx: num(.context_window.used_percentage | if . == null then null else r end),
      cache_frio: (if .prompt_cache.warm == false then "1" else "" end),
      cache_pct: num(.prompt_cache.hit_ratio | if . == null then null else (. * 100 | r) end),
      costo: num(.cost.total_cost_usd | if . == null then null else dinero end),
      mas: (.cost.total_lines_added // 0),
      menos: (.cost.total_lines_removed // 0),
      duracion: num(.cost.total_duration_ms
        | if . == null then null
          else (. / 1000 | floor) as $s | ($s / 3600 | floor) as $h | ($s % 3600 / 60 | floor) as $m
            | if $h > 0 then "\($h)h\($m | dos)m" else "\($m)m" end
          end),
      s5_pct: num(.rate_limits.five_hour.used_percentage | if . == null then null else r end),
      s5_falta: num(.rate_limits.five_hour.resets_at | if . == null then null else falta end),
      s7_pct: num(.rate_limits.seven_day.used_percentage | if . == null then null else r end),
      s7_falta: num(.rate_limits.seven_day.resets_at | if . == null then null else falta end),
      s7_dia: num(.rate_limits.seven_day.resets_at | if . == null then null else dia_hora end),
      hora: (now | localtime | "\(.[3] | dos):\(.[4] | dos)")
    }
  | to_entries[] | "\(.key)=\(.value | tostring | @sh)"
' <<<"$entrada" 2>/dev/null | tr -d '\r')

if [ -z "$datos" ]; then
  printf '%s\n' "statusline: no pude leer los datos de la sesión"
  exit 0
fi
eval "$datos"

# Colores
R=$'\e[0m'; DIM=$'\e[2m'; B=$'\e[1m'
CYAN=$'\e[36m'; MAG=$'\e[35m'; GRN=$'\e[32m'; YEL=$'\e[33m'; RED=$'\e[31m'; BLU=$'\e[34m'
SEP="${DIM} · ${R}"

# Verde < 70, amarillo < 90, rojo ≥ 90
color_pct() {
  local p=$1
  if [ -z "$p" ]; then echo "$DIM"; elif [ "$p" -ge 90 ]; then echo "$RED"; elif [ "$p" -ge 70 ]; then echo "$YEL"; else echo "$GRN"; fi
}

# Rama git (si la carpeta es un repo); «*» si hay cambios sin guardar
rama=""
if [ -n "$dir" ] && command -v git >/dev/null 2>&1 \
   && b=$(git -C "$dir" --no-optional-locks branch --show-current 2>/dev/null) && [ -n "$b" ]; then
  sucio=""
  [ -n "$(git -C "$dir" --no-optional-locks status --porcelain 2>/dev/null | head -1)" ] && sucio="${YEL}*${R}"
  rama="${MAG}⎇ ${b}${R}${sucio}"
fi

l1="${B}${CYAN}${modelo}${R}"
[ -n "$rapido" ] && l1+=" ${YEL}⚡${R}"
[ -n "$sesion" ] && l1+="${SEP}${B}«${sesion}»${R}"
[ -n "$carpeta" ] && l1+="${SEP}${BLU}📁 ${carpeta}${R}"
[ -n "$rama" ] && l1+="${SEP}${rama}"
[ -n "$worktree" ] && l1+="${SEP}${MAG}🌿 ${worktree}${R}"
[ -n "$agente" ] && l1+="${SEP}${CYAN}🤖 ${agente}${R}"
[ -n "$esfuerzo" ] && l1+="${SEP}eff ${B}${esfuerzo}${R}"
[ -n "$thinking" ] && l1+="${SEP}thinking ${B}${thinking}${R}"

# Contexto usado
if [ -n "$ctx" ]; then
  l2="ctx $(color_pct "$ctx")${ctx}%${R}"
else
  l2="ctx ${DIM}–${R}"
fi

# Caché: % de aciertos (verde ≥ 80, amarillo ≥ 50, rojo abajo); ❄ si está fría
if [ -n "$cache_frio" ]; then
  l2+="${SEP}cache ${DIM}❄${R}"
elif [ -n "$cache_pct" ]; then
  if [ "$cache_pct" -ge 80 ]; then hc=$GRN; elif [ "$cache_pct" -ge 50 ]; then hc=$YEL; else hc=$RED; fi
  l2+="${SEP}cache ${hc}${cache_pct}%${R}"
fi

[ -n "$costo" ] && l2+="${SEP}\$${costo}"

# Líneas añadidas / quitadas
if [ "$mas" != 0 ] || [ "$menos" != 0 ]; then
  l2+="${SEP}${GRN}+${mas}${R} ${RED}−${menos}${R}"
fi

[ -n "$duracion" ] && l2+="${SEP}⏱ ${duracion}"

# Límites de la suscripción: sesión (5 h) y semanal (7 días)
if [ -n "$s5_pct" ]; then
  seg="sesión $(color_pct "$s5_pct")${s5_pct}%${R}"
  [ -n "$s5_falta" ] && seg+=" ${DIM}↻ ${s5_falta}${R}"
  l2+="${SEP}${seg}"
fi
if [ -n "$s7_pct" ]; then
  seg="semana $(color_pct "$s7_pct")${s7_pct}%${R}"
  [ -n "$s7_falta" ] && seg+=" ${DIM}↻ ${s7_falta} (${s7_dia})${R}"
  l2+="${SEP}${seg}"
fi

# Perfil de AWS (solo si está definido en el entorno de Claude Code) y hora
[ -n "${AWS_PROFILE:-}" ] && l2+="${SEP}${YEL}☁ ${AWS_PROFILE}${R}"
l2+="${SEP}${DIM}🕐 ${hora}${R}"

printf '%s\n' "${l1}${SEP}${l2}"
