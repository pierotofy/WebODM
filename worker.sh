#!/bin/bash
__dirname=$(cd $(dirname "$0"); pwd -P)
cd ${__dirname}

usage(){
  echo "Usage: $0 <command>"
  echo
  echo "This program manages the background worker processes. WebODM requires at least one background process worker to be running at all times."
  echo 
  echo "Command list:"
  echo "	start				Start background worker"
  echo "	scheduler start		Start background worker scheduler"
  echo "	scheduler stop 		Stop background worker scheduler"
  exit
}

check_command(){
	check_msg_prefix="Checking for $1... "
	check_msg_result="\033[92m\033[1m OK\033[0m\033[39m"

	hash $1 2>/dev/null || not_found=true 
	if [[ $not_found ]]; then
		
		# Can we attempt to install it?
		if [[ ! -z "$3" ]]; then
			echo -e "$check_msg_prefix \033[93mnot found, we'll attempt to install\033[39m"
			run "$3 || sudo $3"

			# Recurse, but don't pass the install command
			check_command "$1" "$2"	
		else
			check_msg_result="\033[91m can't find $1! Check that the program is installed and that you have added the proper path to the program to your PATH environment variable before launching WebODM. If you change your PATH environment variable, remember to close and reopen your terminal. $2\033[39m"
		fi
	fi

	echo -e "$check_msg_prefix $check_msg_result"
	if [[ $not_found ]]; then
		return 1
	fi
}

environment_check(){
	check_command "celery" "Run \033[1msudo pip install -U celery\033[0m" "pip install -U celery"
	if [[ -z "$WO_BROKER" ]]; then
		echo -e "\033[91mWO_BROKER environment variable is not set. Defaulting to redis://localhost\033[39m"
		export WO_BROKER=redis://localhost
	fi
}


start(){
	action=$1

	echo "Starting worker using broker at $WO_BROKER"
	celery -A worker worker --autoscale $(grep -c '^processor' /proc/cpuinfo),2 --max-tasks-per-child 1000 --loglevel=warn > /dev/null
}

sched_pid="./celerybeat.pid"
check_scheduler_pid="./sched_check.pid"

start_scheduler(){
	stop_scheduler
	if [[ ! -f $sched_pid ]]; then
		celery -A worker beat &
	else
		echo "Scheduler already running (celerybeat.pid exists)."
	fi
}

stop_scheduler(){
	if [[ -f $sched_pid ]]; then
		kill -9 $(cat $sched_pid) 2>/dev/null
		rm $sched_pid 2>/dev/null
		echo "Scheduler has shutdown."
	else
		echo "Scheduler is not running."
	fi
}

is_scheduler_running(){
	if [[ -f $sched_pid ]]; then
		pid=$(cat $sched_pid )
		if kill -0 $pid 2>/dev/null; then
			return 1
		else
			return 0
		fi
	else
		return 0
	fi
}

start_check_scheduler(){
    stop_check_scheduler
	echo "Started scheduler check"
	sched_pid=$$
	echo $sched_pid > $check_scheduler_pid

    while [[ -f $check_scheduler_pid ]]; do
        sleep 10
        if ! is_scheduler_running; then
            echo "Scheduler not running, restarting..."
            start_scheduler
        fi
    done
}

stop_check_scheduler() {
	if [[ -f $check_scheduler_pid ]]; then
		kill -9 $(cat $check_scheduler_pid) 2>/dev/null
		rm $check_scheduler_pid 2>/dev/null
		echo "Scheduler check has shutdown."
	fi
}

if [[ $1 = "start" ]]; then
	environment_check
	start
elif [[ $1 = "scheduler" ]]; then
	if [[ $2 = "start" ]]; then
		environment_check
		stop_check_scheduler
		start_scheduler
		start_check_scheduler &
	elif [[ $2 = "stop" ]]; then
		environment_check
		stop_check_scheduler
		stop_scheduler
	else
		usage
	fi
else
	usage
fi
