#!/bin/bash

# Script to monitor and clean up Python LSP processes

echo "=== Python LSP Process Monitor ==="
echo

# Function to count Python LSP processes
count_pylsp() {
    pgrep -f "(pylsp|python.*pylsp)" | wc -l | tr -d ' '
}

# Function to list Python LSP processes with details
list_pylsp() {
    echo "Current Python LSP processes:"
    ps aux | grep -E "(pylsp|python.*pylsp)" | grep -v grep | grep -v monitor-python-lsp || echo "  None found"
}

# Function to kill duplicate Python LSP processes
cleanup_duplicates() {
    local pids=($(pgrep -f "(pylsp|python.*pylsp)"))
    local count=${#pids[@]}
    
    if [ $count -gt 1 ]; then
        echo "⚠️  Found $count Python LSP processes. Keeping first, killing duplicates..."
        for ((i=1; i<$count; i++)); do
            echo "  Killing PID ${pids[$i]}..."
            kill -TERM ${pids[$i]} 2>/dev/null || true
        done
        echo "✅ Cleanup complete"
    elif [ $count -eq 1 ]; then
        echo "✅ Only one Python LSP process running (PID: ${pids[0]})"
    else
        echo "ℹ️  No Python LSP processes running"
    fi
}

# Function to kill all Python LSP processes
kill_all() {
    echo "Killing all Python LSP processes..."
    pkill -f "(pylsp|python.*pylsp)" 2>/dev/null || true
    sleep 1
    local remaining=$(count_pylsp)
    if [ "$remaining" -eq "0" ]; then
        echo "✅ All Python LSP processes killed"
    else
        echo "⚠️  $remaining processes still running, trying SIGKILL..."
        pkill -9 -f "(pylsp|python.*pylsp)" 2>/dev/null || true
    fi
}

# Main menu
case "${1:-status}" in
    status)
        list_pylsp
        echo
        echo "Total count: $(count_pylsp) process(es)"
        ;;
    cleanup)
        cleanup_duplicates
        ;;
    kill-all)
        kill_all
        ;;
    monitor)
        echo "Monitoring Python LSP processes (Ctrl+C to stop)..."
        while true; do
            count=$(count_pylsp)
            echo -ne "\rPython LSP processes: $count  "
            if [ "$count" -gt "1" ]; then
                echo
                echo "⚠️  Multiple processes detected!"
                list_pylsp
                echo
                read -p "Clean up duplicates? (y/n) " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    cleanup_duplicates
                fi
            fi
            sleep 5
        done
        ;;
    *)
        echo "Usage: $0 {status|cleanup|kill-all|monitor}"
        echo
        echo "  status   - Show current Python LSP processes"
        echo "  cleanup  - Kill duplicate processes, keep one"
        echo "  kill-all - Kill all Python LSP processes"
        echo "  monitor  - Continuously monitor for duplicates"
        exit 1
        ;;
esac