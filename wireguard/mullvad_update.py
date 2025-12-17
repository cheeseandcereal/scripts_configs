#!/usr/bin/env python3

import os
import json
import argparse
import requests

MULLVAD_SERVER_DATA = 'https://mullvad.net/en/servers/__data.json'


def pretty_print_servers(servers):
    for i in range(len(servers)):
        s = servers[i]
        print(f"{i+1:02} - {s['hostname']} - {s['provider']} / {s['network_port_speed']} Gbps - Owned: {s['owned']} - IP: {s['ipv4_addr_in']}")


def parse_sveltkit_data_json(sveltkit_text):
    data_lines = sveltkit_text.splitlines()
    raw_json = json.loads(data_lines[-1])
    for raw_data in raw_json['nodes']:
        if isinstance(raw_data, dict) and len(raw_data['data']) > 100:
            data = raw_data['data'][2:]
    data_ref = {}
    items = []
    info_id_list = []
    # Parse sveltekit-data json into array of items
    for piece in data:
        if isinstance(piece, dict):
            items.append(piece)
            for val in piece.values():
                info_id_list.append(val)
        else:
            while info_id_list and info_id_list[0] in data_ref:
                info_id_list = info_id_list[1:]
            if not info_id_list:
                raise RuntimeError(f'Error parsing at {piece}, was not looking for data pieces')
            data_ref[info_id_list[0]] = piece
    # Fill in item data from data refs to finish parsing
    for item in items:
        for key in item.keys():
            item[key] = data_ref[item[key]]
    return items


def main(servers_json_path, city_code, conf_file):
    # Fetch server data from mullvad
    print('Fetching server list from mullvad')
    resp = requests.get(MULLVAD_SERVER_DATA)
    resp.raise_for_status()
    print('Parsing server data from mullvad')
    servers = parse_sveltkit_data_json(resp.text)
    # Save resulting parsed server json if necessary
    if servers_json_path:
        print(f'Saving parsed server data to {servers_json_path}')
        with open(servers_json_path, 'w') as f:
            json.dump(servers, f, indent=2)
    # Filter to only active wireguard servers in specified city code
    servers = list(filter(lambda s: s.get('active') and s['type'] == 'wireguard' and s['city_code'] == city_code, servers))
    # Sort to prefer servers with more bandwidth, then if they are owned
    servers.sort(key=lambda s: (s['network_port_speed'], s['owned']), reverse=True)
    # Read existing configuration
    print(f'Reading existing wireguard configuration from {conf_file}')
    existing_conf = []
    with open(conf_file) as f:
        existing_conf = f.readlines()
    # Print servers and prompt user for selection
    pretty_print_servers(servers)
    print('Input which server you would like to use: ', end='')
    selected = servers[int(input()) - 1]
    # Replace endpoint and public key in existing conf lines
    for i in range(len(existing_conf)):
        if existing_conf[i].startswith('Endpoint'):
            existing_conf[i] = f'Endpoint = {selected["ipv4_addr_in"]}:53\n'
        elif existing_conf[i].startswith('PublicKey'):
            existing_conf[i] = f'PublicKey = {selected["pubkey"]}\n'
    # Write new configuration
    print(f'Writing new wireguard configuration to {conf_file}')
    with open(conf_file, 'w') as f:
        f.writelines(existing_conf)
    os.chmod(conf_file, 0o600)
    print(f'Successfully updated {conf_file} with server {selected["hostname"]} ({selected["ipv4_addr_in"]})')


if __name__ == '__main__':
    fn = argparse.ArgumentParser(
        description='Dynamic mullvad wireguard config generator',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    fn.add_argument(
        '--output-servers-json',
        '-j',
        action='store',
        help='Path to location to store raw parsed servers json data from mullvad',
    )
    fn.add_argument(
        '--city-code',
        '-c',
        action='store',
        help='3 letter city code for which servers will be filtered',
        default='sea',
    )
    fn.add_argument(
        '--wg-conf',
        '-w',
        action='store',
        help='Path to wireguard conf file to overwrite',
        default='/etc/wireguard/mullvad.conf',
    )
    args = fn.parse_args()
    main(args.output_servers_json, args.city_code, args.wg_conf)
