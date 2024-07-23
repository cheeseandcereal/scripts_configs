#!/usr/bin/env python3

import argparse
import json
from os import walk
from pathlib import PurePath

from transmission_rpc import Client


def get_config(config_file_path):
    config_file = {}
    if config_file_path:
        with open(config_file_path, 'r') as f:
            config_file = json.load(f)
    return {
        'protocol': 'https' if config_file.get('verified_tls') else 'http',
        'username': config_file.get('username') or '',
        'password': config_file.get('password') or '',
        'host': config_file.get('host') or '127.0.0.1',
        'port': config_file.get('port') or 9091,
        'path': config_file.get('path') or '/transmission/rpc',
    }


def main():
    parser = argparse.ArgumentParser(description='Find files in a directory which are unused by all torrents in a transmission instance')
    parser.add_argument(
        '-c',
        '--config',
        action='store',
        help='Transmission config json file for RPC',
    )
    parser.add_argument(
        '-d',
        '--directory',
        action='store',
        help='The base directory to compare (if not specified, the default download directory configured in transmission is used)',
    )
    parser.add_argument(
        '-i',
        '--inverse',
        action='store_true',
        help='Find files in transmission that aren\'t on the local filesystem instead',
    )
    args = parser.parse_args()
    transmission = Client(**get_config(args.config))
    print('Successfully connected to transmission')
    base_transmission_dir = transmission.get_session().download_dir
    local_dir = PurePath(args.directory or base_transmission_dir)

    print('Fetching files from transmission')
    transmission_files = set()
    for torrent in transmission.get_torrents(arguments=['files', 'priorities', 'wanted', 'downloadDir']):
        for file in torrent.get_files():
            if file.selected:
                transmission_files.add(PurePath(torrent.download_dir, file.name).as_posix())
    print(f'Found {len(transmission_files)} files in transmission. Listing local files')

    local_files = set()
    for root, _, files in walk(local_dir, followlinks=True):
        for file_name in files:
            local_files.add(PurePath(root, file_name))
    print(f'Found {len(local_files)} local files. Now performing diff')

    if not args.inverse:
        print('Files below this are unused in transmission\n------------------')
        found = False
        for file in local_files:
            translate_file = file.as_posix().replace(local_dir.as_posix(), base_transmission_dir, 1)
            if translate_file not in transmission_files:
                print(file)
                found = True
        if not found:
            print('No unused files found')
    else:
        print('Files below this exist in transmission but not in the local filesystem\n------------------')
        found = False
        local_translated_files = set()
        for file in local_files:
            local_translated_files.add(file.as_posix().replace(local_dir.as_posix(), base_transmission_dir, 1))
        for file in transmission_files:
            if file not in local_translated_files:
                print(file)
                found = True
        if not found:
            print('No missing files found')


if __name__ == '__main__':
    main()
