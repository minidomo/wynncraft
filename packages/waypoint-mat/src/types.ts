export type WaypointIcon = 'farming' | 'mining' | 'woodcutting' | 'fishing';
export type WaypointVisibility = 'default' | 'always';
export type WaypointCoordinates = {
	x: number;
	y: number;
	z: number;
};

export interface Waypoint {
	name: string;
	// color of waypoint in #AARRGGBB format, where AA is the alpha channel (opacity), RR is red, GG is green, and BB is blue.
	color: string;
	icon: WaypointIcon;
	visibility: WaypointVisibility;
	location: WaypointCoordinates;
}

export type WaypointIncomplete = Omit<Waypoint, 'location'> & {
	territory: string;
	notes?: string;
};
