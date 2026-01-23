#!/usr/bin/bash
set -e

ROOT="$(realpath $(dirname ${BASH_SOURCE[0]}))"
cd "$ROOT"

export PATH="$ROOT/ui/node_modules/.bin:$PATH"

@ui() {
    cd $ROOT/ui
    cmd="$1"; shift
    case "$cmd" in
    i*) npm install "$@" ;;
    w*) vite dev "$@" ;;
    b*) tsc && vite build "$@";;
    npm) npm "$@" ;;
    run) vite preview "$@" ;;
    check) tsc "$@" ;;
    test) exit 0 ;;
    f*) prettier . --write;;
    *) echo "subcommands: watch run build check test fmt..." ;;
    esac
}

@api() {
    cd $ROOT/api
    cmd="$1"; shift
    case "$cmd" in 
    w*) watchexec -r -e go go run . "$@" ;;
    b*) go build -o api "$@" . ;;
    run) go run "$@" . ;;
    vet) go vet "$@" . ;;
    test) exit 0 ;;
    f*) go fmt "$@" .;;
    *) echo "subcommands: watch run build check test fmt" ;;
    esac
}
@fmt() {
    @api fmt
    @ui fmt
}

##################################################################################################
DEFAULT=help
@help() {
    echo "do™️: Manage this project."
    echo 
    echo "Available commands:"
    compgen -A function @ | sed "s|^@|\t$0 |"
}

if [[ -z $1 ]]; then
    eval "@$DEFAULT"
else
    if compgen -A function "@$1" >/dev/null; then
        task="@$1"; shift
        eval "$task \"\$@\""
    else
        echo "No such task: $1"
        echo
        @help
        exit 1
    fi
fi
