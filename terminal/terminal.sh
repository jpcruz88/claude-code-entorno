# Herramientas de terminal de claude-code-entorno: eza, bat, zoxide, fzf y atuin.
# Lo carga ~/.zshrc (o ~/.bashrc) con una línea que agrega el instalador.
# Cada parte se salta si falta su programa, así nunca rompe la terminal.
#
#   ll, la         lista archivos con íconos y estado de git (eza); la incluye ocultos
#   lt             árbol de carpetas, dos niveles (eza)
#   z <carpeta>    salta a una carpeta que ya visitaste (zoxide); zi la elige con fzf
#   ctrl+t         busca un archivo y lo pega en el comando (fzf, con vista previa)
#   alt+c          entra a una subcarpeta (fzf)
#   ctrl+r         busca en el historial de todas tus terminales (atuin; en bash, fzf)
#   bat <archivo>  muestra un archivo con colores, con el tema de VS Code
#
# No cambia ls ni cat: Claude Code y los scripts los usan y esperan su salida de siempre.

case $- in *i*) ;; *) return 0 ;; esac  # solo en terminales interactivas

if [ -n "$ZSH_VERSION" ]; then _cce_shell=zsh
elif [ -n "$BASH_VERSION" ]; then _cce_shell=bash
else return 0
fi

export BAT_THEME="Visual Studio Dark+"

if command -v eza >/dev/null 2>&1; then
  alias ll='eza -l --icons=auto --git --group-directories-first'
  alias la='eza -la --icons=auto --git --group-directories-first'
  alias lt='eza --tree --level=2 --icons=auto --git-ignore'
fi

if command -v fzf >/dev/null 2>&1; then
  eval "$(fzf --$_cce_shell)"
  if command -v bat >/dev/null 2>&1; then
    export FZF_CTRL_T_OPTS="--preview 'bat --color=always --style=numbers --line-range=:200 {}'"
  fi
fi

if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init $_cce_shell)"
fi

# Después de fzf, para que ctrl+r sea el de atuin. La flecha arriba queda como siempre.
# Solo en zsh: en bash, atuin necesita bash-preexec.
if [ "$_cce_shell" = zsh ] && command -v atuin >/dev/null 2>&1; then
  eval "$(atuin init zsh --disable-up-arrow)"
fi

unset _cce_shell
