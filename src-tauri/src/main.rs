// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::panic;

fn main() {
    let args: Vec<String> = env::args().collect();
    let test_launch = args.iter().any(|a| a == "--test-launch");
    
    if test_launch && args.len() > 1 {
        // Find the instance ID after --test-launch
        if let Some(pos) = args.iter().position(|a| a == "--test-launch") {
            if pos + 1 < args.len() {
                modcanvas_lib::set_test_instance_id(args[pos + 1].clone());
            }
        }
    }

    // Catch panics and print them before aborting
    let default_hook = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Box<dyn Any>".to_string()
        };
        let loc = info.location().map(|l| format!(" at {}:{}", l.file(), l.line())).unwrap_or_default();
        eprintln!("[ModCanvas] PANIC: {msg}{loc}");
        default_hook(info);
    }));

    if test_launch {
        eprintln!("[ModCanvas] Test launch mode enabled");
    }

    modcanvas_lib::run();
}
