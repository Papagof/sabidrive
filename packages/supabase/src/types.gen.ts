/**
 * Generated via the Supabase MCP `generate_typescript_types` tool from the
 * live schema (project ubslfmtqebuuxujohksd) after Phase 2 migrations
 * 0008-0014. Regenerate and replace this file whenever migrations change.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          notes: string | null
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          school_id: string
          severity: string
          trip_id: string | null
          type: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          school_id: string
          severity?: string
          trip_id?: string | null
          type: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          severity?: string
          trip_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          school_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_expectations: {
        Row: {
          id: string
          status: string
          student_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          status?: string
          student_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          status?: string
          student_id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_expectations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_expectations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      buses: {
        Row: {
          attendant_id: string | null
          capacity: number | null
          created_at: string
          current_trip_id: string | null
          default_route_id: string | null
          driver_id: string | null
          id: string
          label: string
          license_plate: string | null
          retired_at: string | null
          school_id: string
          status: string
        }
        Insert: {
          attendant_id?: string | null
          capacity?: number | null
          created_at?: string
          current_trip_id?: string | null
          default_route_id?: string | null
          driver_id?: string | null
          id?: string
          label: string
          license_plate?: string | null
          retired_at?: string | null
          school_id: string
          status?: string
        }
        Update: {
          attendant_id?: string | null
          capacity?: number | null
          created_at?: string
          current_trip_id?: string | null
          default_route_id?: string | null
          driver_id?: string | null
          id?: string
          label?: string
          license_plate?: string | null
          retired_at?: string | null
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "buses_attendant_id_fkey"
            columns: ["attendant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buses_current_trip_id_fkey"
            columns: ["current_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buses_default_route_id_fkey"
            columns: ["default_route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_events: {
        Row: {
          event_type: string
          id: string
          lat: number | null
          lng: number | null
          method: string
          occurred_at: string
          scanned_by: string | null
          stop_id: string | null
          student_id: string
          trip_id: string
        }
        Insert: {
          event_type: string
          id?: string
          lat?: number | null
          lng?: number | null
          method?: string
          occurred_at?: string
          scanned_by?: string | null
          stop_id?: string | null
          student_id: string
          trip_id: string
        }
        Update: {
          event_type?: string
          id?: string
          lat?: number | null
          lng?: number | null
          method?: string
          occurred_at?: string
          scanned_by?: string | null
          stop_id?: string | null
          student_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_in_events_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_events_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_student_links: {
        Row: {
          created_at: string
          guardian_id: string
          id: string
          is_authorized_pickup: boolean
          is_primary: boolean
          relationship: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          id?: string
          is_authorized_pickup?: boolean
          is_primary?: boolean
          relationship?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          id?: string
          is_authorized_pickup?: boolean
          is_primary?: boolean
          relationship?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_student_links_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_student_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          recipient_id: string
          related_student_id: string | null
          related_trip_id: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id: string
          related_student_id?: string | null
          related_trip_id?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id?: string
          related_student_id?: string | null
          related_trip_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_student_id_fkey"
            columns: ["related_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_trip_id_fkey"
            columns: ["related_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_codes: {
        Row: {
          consumed_at: string | null
          consumed_trip_id: string | null
          created_at: string
          event_type: string
          expires_at: string
          guardian_id: string
          id: string
          phone: string
          status: string
          student_id: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_trip_id?: string | null
          created_at?: string
          event_type: string
          expires_at?: string
          guardian_id: string
          id?: string
          phone: string
          status?: string
          student_id: string
        }
        Update: {
          consumed_at?: string | null
          consumed_trip_id?: string | null
          created_at?: string
          event_type?: string
          expires_at?: string
          guardian_id?: string
          id?: string
          phone?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_codes_consumed_trip_id_fkey"
            columns: ["consumed_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_codes_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_overrides: {
        Row: {
          authorized_name: string
          authorized_relationship: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          student_id: string
          valid_date: string
        }
        Insert: {
          authorized_name: string
          authorized_relationship?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          student_id: string
          valid_date?: string
        }
        Update: {
          authorized_name?: string
          authorized_relationship?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          student_id?: string
          valid_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_overrides_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          phone_verified: boolean
          role: string
          school_id: string | null
          verification_status: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          phone_verified?: boolean
          role: string
          school_id?: string | null
          verification_status?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          phone_verified?: boolean
          role?: string
          school_id?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          direction: string
          id: string
          is_active: boolean
          name: string
          polyline: Json
          school_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          name: string
          polyline?: Json
          school_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          name?: string
          polyline?: Json
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          created_at: string
          geofence_lat: number | null
          geofence_lng: number | null
          geofence_radius_m: number
          id: string
          name: string
          timezone: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      sms_outbox: {
        Row: {
          body: string
          created_at: string
          id: string
          recipient_phone: string
          related_notification_id: string | null
          status: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          recipient_phone: string
          related_notification_id?: string | null
          status?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          recipient_phone?: string
          related_notification_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_outbox_related_notification_id_fkey"
            columns: ["related_notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          radius_m: number
          route_id: string
          scheduled_time: string | null
          school_id: string
          sequence_no: number
        }
        Insert: {
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          radius_m?: number
          route_id: string
          scheduled_time?: string | null
          school_id: string
          sequence_no: number
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          radius_m?: number
          route_id?: string
          scheduled_time?: string | null
          school_id?: string
          sequence_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stops_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          default_route_id: string | null
          default_stop_id: string | null
          first_name: string
          grade: string | null
          id: string
          last_name: string
          photo_url: string | null
          qr_token: string
          school_id: string
        }
        Insert: {
          created_at?: string
          default_route_id?: string | null
          default_stop_id?: string | null
          first_name: string
          grade?: string | null
          id?: string
          last_name: string
          photo_url?: string | null
          qr_token?: string
          school_id: string
        }
        Update: {
          created_at?: string
          default_route_id?: string | null
          default_stop_id?: string | null
          first_name?: string
          grade?: string | null
          id?: string
          last_name?: string
          photo_url?: string | null
          qr_token?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_default_route_id_fkey"
            columns: ["default_route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_default_stop_id_fkey"
            columns: ["default_stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_locations: {
        Row: {
          heading_deg: number | null
          id: number
          lat: number
          lng: number
          recorded_at: string
          source: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          heading_deg?: number | null
          id?: never
          lat: number
          lng: number
          recorded_at?: string
          source?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          heading_deg?: number | null
          id?: never
          lat?: number
          lng?: number
          recorded_at?: string
          source?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stop_etas: {
        Row: {
          distance_m: number | null
          eta_minutes: number
          stop_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          distance_m?: number | null
          eta_minutes: number
          stop_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          distance_m?: number | null
          eta_minutes?: number
          stop_id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stop_etas_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stop_etas_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stop_approaches: {
        Row: {
          notified_at: string
          stop_id: string
          trip_id: string
        }
        Insert: {
          notified_at?: string
          stop_id: string
          trip_id: string
        }
        Update: {
          notified_at?: string
          stop_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stop_approaches_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stop_approaches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          avg_speed_kmh: number
          bus_id: string
          created_at: string
          direction: string
          driver_id: string
          ended_at: string | null
          id: string
          route_id: string
          school_id: string
          started_at: string | null
          status: string
          trip_date: string
        }
        Insert: {
          avg_speed_kmh?: number
          bus_id: string
          created_at?: string
          direction: string
          driver_id: string
          ended_at?: string | null
          id?: string
          route_id: string
          school_id: string
          started_at?: string | null
          status?: string
          trip_date?: string
        }
        Update: {
          avg_speed_kmh?: number
          bus_id?: string
          created_at?: string
          direction?: string
          driver_id?: string
          ended_at?: string | null
          id?: string
          route_id?: string
          school_id?: string
          started_at?: string | null
          status?: string
          trip_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_trip: { Args: { target_trip_id: string }; Returns: boolean }
      check_in: {
        Args: { p_event_type?: string; p_method?: string; p_qr_token: string; p_trip_id: string }
        Returns: undefined
      }
      create_announcement: {
        Args: { p_body: string; p_title: string }
        Returns: string
      }
      current_role: { Args: never; Returns: string }
      current_school_id: { Args: never; Returns: string }
      end_trip: { Args: { p_trip_id: string }; Returns: undefined }
      is_guardian_of: { Args: { target_student_id: string }; Returns: boolean }
      is_trip_crew: { Args: { p_trip_id: string }; Returns: boolean }
      purge_old_data: { Args: never; Returns: undefined }
      record_manual_trip_location: {
        Args: { p_lat: number; p_lng: number; p_trip_id: string }
        Returns: undefined
      }
      record_trip_location: {
        Args: {
          p_deviation_m?: number
          p_heading_deg?: number
          p_lat: number
          p_lng: number
          p_speed_kmh?: number
          p_stop_etas?: Json
          p_trip_id: string
        }
        Returns: undefined
      }
      start_trip: {
        Args: { p_bus_id: string; p_direction?: string }
        Returns: string
      }
      trigger_sos: { Args: { p_trip_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
