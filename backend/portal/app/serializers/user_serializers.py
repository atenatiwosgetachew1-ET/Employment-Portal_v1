from django.contrib.auth.models import User
from rest_framework import serializers

from ..auth_utils import get_profile_role, is_admin, is_superadmin
from ..employee_selection import agent_display_name, agent_office_display_name, ensure_agent_office_for_owner
from ..licensing import can_assign_role, get_user_organization
from ..models import AgentMembership, AgentOffice, OrganizationMembership, Profile
from .helpers import STAFF_ROLE_LEVELS, normalize_phone



class UserListSerializer(serializers.ModelSerializer):
    """Read + list representation with profile fields."""

    role = serializers.CharField(source="profile.role", read_only=True)
    phone = serializers.CharField(source="profile.phone", read_only=True)
    agent_country = serializers.CharField(source="profile.agent_country", read_only=True)
    agent_commission = serializers.DecimalField(
        source="profile.agent_commission",
        max_digits=10,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    agent_salary = serializers.DecimalField(
        source="profile.agent_salary",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    staff_side = serializers.CharField(source="profile.staff_side", read_only=True)
    staff_level = serializers.IntegerField(source="profile.staff_level", read_only=True)
    staff_level_label = serializers.CharField(source="profile.staff_level_label", read_only=True)
    agent_office_id = serializers.IntegerField(source="profile.agent_office_id", read_only=True)
    agent_office_name = serializers.SerializerMethodField()
    email_verified = serializers.BooleanField(source="profile.email_verified", read_only=True)
    google_linked = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="profile.organization.name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "role",
            "phone",
            "agent_country",
            "agent_commission",
            "agent_salary",
            "staff_side",
            "staff_level",
            "staff_level_label",
            "agent_office_id",
            "agent_office_name",
            "email_verified",
            "google_linked",
            "organization_name",
        )
        read_only_fields = fields

    def get_google_linked(self, obj):
        return bool(getattr(obj.profile, "google_sub", None))

    def get_agent_office_name(self, obj):
        profile = getattr(obj, "profile", None)
        if not profile:
            return ""
        agent_office = getattr(profile, "agent_office", None)
        if agent_office:
            return agent_office_display_name(agent_office)
        if profile.role == Profile.ROLE_CUSTOMER:
            return agent_display_name(obj)
        return ""


class SelfProfileSerializer(serializers.Serializer):
    """PATCH /api/me/ — edit own username, name, phone."""

    username = serializers.CharField(max_length=150, required=False)
    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    phone = serializers.CharField(max_length=30, allow_blank=True, required=False)

    def validate_username(self, value):
        v = (value or "").strip()
        if not v:
            raise serializers.ValidationError("Username is required.")
        max_len = User._meta.get_field("username").max_length
        if len(v) > max_len:
            raise serializers.ValidationError(f"At most {max_len} characters.")
        user = self.context["request"].user
        if User.objects.filter(username__iexact=v).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("This username is already taken.")
        return v

    def update(self, user, validated_data):
        if "username" in validated_data:
            user.username = validated_data["username"]
        if "first_name" in validated_data:
            user.first_name = validated_data["first_name"] or ""
        if "last_name" in validated_data:
            user.last_name = validated_data["last_name"] or ""
        user.save()
        if "phone" in validated_data:
            p = user.profile
            p.phone = validated_data.get("phone", "") or ""
            p.save(update_fields=["phone"])
        return user


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Profile.ROLE_CHOICES, default=Profile.ROLE_CUSTOMER)
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    agent_country = serializers.CharField(required=False, allow_blank=True, default="")
    agent_commission = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=10,
        decimal_places=2,
    )
    agent_salary = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=12,
        decimal_places=2,
    )
    staff_side = serializers.CharField(required=False, allow_blank=True, default="")
    staff_level = serializers.IntegerField(required=False, min_value=1, max_value=5, default=1)
    staff_level_label = serializers.CharField(required=False, allow_blank=True, default="")
    agent_office_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "role",
            "phone",
            "agent_country",
            "agent_commission",
            "agent_salary",
            "staff_side",
            "staff_level",
            "staff_level_label",
            "agent_office_id",
        )

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        actor = request.user
        role = attrs.get("role", Profile.ROLE_CUSTOMER)
        actor_org = get_user_organization(actor)
        agent_office_supplied = "agent_office_id" in attrs
        requested_agent_office_id = attrs.get("agent_office_id")
        requested_agent_office = None
        if requested_agent_office_id:
            requested_agent_office = AgentOffice.objects.filter(
                id=requested_agent_office_id,
                organization=actor_org,
                is_active=True,
            ).select_related("owner").first()
            if not requested_agent_office:
                raise serializers.ValidationError({"agent_office_id": "Choose a valid agent office."})
        if role == Profile.ROLE_STAFF:
            attrs["agent_office"] = requested_agent_office
            attrs["staff_side"] = (
                agent_office_display_name(requested_agent_office)
                if requested_agent_office
                else (attrs.get("staff_side") or "").strip() or (actor_org.name if actor_org else "")
            )
            attrs["agent_country"] = ""
            attrs["agent_commission"] = None
            attrs["agent_salary"] = None
            attrs["staff_level_label"] = (attrs.get("staff_level_label") or "").strip()
            if not attrs["staff_side"]:
                raise serializers.ValidationError({"staff_side": "Staff side is required."})
            if attrs["staff_level_label"] not in STAFF_ROLE_LEVELS:
                raise serializers.ValidationError(
                    {"staff_level_label": f"Choose one of: {', '.join(STAFF_ROLE_LEVELS)}."}
                )
            attrs["staff_level"] = STAFF_ROLE_LEVELS[attrs["staff_level_label"]]
        else:
            attrs["staff_side"] = ""
            attrs["staff_level"] = 1
            attrs["staff_level_label"] = ""
            if role == Profile.ROLE_CUSTOMER:
                attrs["agent_country"] = (attrs.get("agent_country") or "").strip()
                if not attrs["agent_country"]:
                    raise serializers.ValidationError(
                        {"agent_country": "Country is required for agent accounts."}
                    )
                if attrs.get("agent_salary") in (None, ""):
                    raise serializers.ValidationError(
                        {"agent_salary": "Salary is required for agent accounts."}
                    )
            else:
                attrs["agent_country"] = ""
                attrs["agent_commission"] = None
                attrs["agent_salary"] = None
        if is_superadmin(actor):
            allowed, message = can_assign_role(actor_org, role)
            if not allowed:
                raise serializers.ValidationError({"role": message})
            return attrs
        if is_admin(actor):
            if role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                raise serializers.ValidationError(
                    {"role": "Admins may only create staff or agent accounts."}
                )
            allowed, message = can_assign_role(actor_org, role)
            if not allowed:
                raise serializers.ValidationError({"role": message})
            return attrs
        raise serializers.ValidationError("You cannot create users.")

    def create(self, validated_data):
        role = validated_data.pop("role")
        agent_office = validated_data.pop("agent_office", None)
        validated_data.pop("agent_office_id", None)
        phone = validated_data.pop("phone", "")
        agent_country = validated_data.pop("agent_country", "")
        agent_commission = validated_data.pop("agent_commission", None)
        agent_salary = validated_data.pop("agent_salary", None)
        staff_side = validated_data.pop("staff_side", "")
        staff_level = validated_data.pop("staff_level", 1)
        staff_level_label = validated_data.pop("staff_level_label", "")
        password = (validated_data.pop("password", "") or "").strip()
        user = User.objects.create_user(password=password or None, **validated_data)
        if not password:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        actor_org = get_user_organization(self.context["request"].user)
        user.profile.role = role
        user.profile.organization = actor_org
        user.profile.agent_office = agent_office
        user.profile.phone = phone
        user.profile.agent_country = agent_country if role == Profile.ROLE_CUSTOMER else ""
        user.profile.agent_commission = (
            agent_commission if role == Profile.ROLE_CUSTOMER else None
        )
        user.profile.agent_salary = agent_salary if role == Profile.ROLE_CUSTOMER else None
        user.profile.staff_side = staff_side if role == Profile.ROLE_STAFF else ""
        user.profile.staff_level = staff_level if role == Profile.ROLE_STAFF else 1
        user.profile.staff_level_label = (
            staff_level_label if role == Profile.ROLE_STAFF else ""
        )
        user.profile.email_verified = True
        user.profile.save()
        if role == Profile.ROLE_CUSTOMER:
            ensure_agent_office_for_owner(user, organization=actor_org)
        elif role == Profile.ROLE_STAFF and agent_office:
            AgentMembership.objects.update_or_create(
                user=user,
                defaults={
                    "agent_office": agent_office,
                    "role": AgentMembership.ROLE_STAFF,
                    "is_active": user.is_active,
                },
            )
        OrganizationMembership.objects.update_or_create(
            user=user,
            defaults={
                "organization": actor_org,
                "role": role,
                "is_owner": role == Profile.ROLE_SUPERADMIN,
                "is_active": user.is_active,
            },
        )
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=Profile.ROLE_CHOICES, required=False)
    phone = serializers.CharField(required=False, allow_blank=True)
    agent_country = serializers.CharField(required=False, allow_blank=True)
    agent_commission = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=10,
        decimal_places=2,
    )
    agent_salary = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=12,
        decimal_places=2,
    )
    staff_side = serializers.CharField(required=False, allow_blank=True)
    staff_level = serializers.IntegerField(required=False, min_value=1, max_value=5)
    staff_level_label = serializers.CharField(required=False, allow_blank=True)
    agent_office_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "email",
            "first_name",
            "last_name",
            "is_active",
            "role",
            "phone",
            "agent_country",
            "agent_commission",
            "agent_salary",
            "staff_side",
            "staff_level",
            "staff_level_label",
            "agent_office_id",
        )

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        actor = request.user
        instance = self.instance
        new_role = attrs.get("role")
        target_role = new_role or get_profile_role(instance)
        actor_org = get_user_organization(actor)
        target_org = getattr(instance.profile, "organization", None)
        agent_office_supplied = "agent_office_id" in attrs
        requested_agent_office_id = attrs.get("agent_office_id")
        requested_agent_office = None
        if requested_agent_office_id:
            requested_agent_office = AgentOffice.objects.filter(
                id=requested_agent_office_id,
                organization=actor_org,
                is_active=True,
            ).select_related("owner").first()
            if not requested_agent_office:
                raise serializers.ValidationError({"agent_office_id": "Choose a valid agent office."})
        if actor_org and target_org and actor_org.pk != target_org.pk:
            raise serializers.ValidationError("You do not have permission to modify this account.")
        if new_role is not None:
            if is_superadmin(actor):
                allowed, message = can_assign_role(actor_org, new_role, exclude_user=instance)
                if not allowed:
                    raise serializers.ValidationError({"role": message})
            elif is_admin(actor):
                if new_role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                    raise serializers.ValidationError(
                        {"role": "Admins may only assign staff or agent roles."}
                    )
                allowed, message = can_assign_role(actor_org, new_role, exclude_user=instance)
                if not allowed:
                    raise serializers.ValidationError({"role": message})
            else:
                raise serializers.ValidationError({"role": "You cannot change roles."})
        if target_role == Profile.ROLE_STAFF:
            if agent_office_supplied or new_role == Profile.ROLE_STAFF:
                attrs["agent_office"] = requested_agent_office
            attrs["agent_country"] = ""
            attrs["agent_commission"] = None
            attrs["agent_salary"] = None
            next_side = (
                agent_office_display_name(requested_agent_office)
                if agent_office_supplied and requested_agent_office
                else (attrs.get("staff_side", instance.profile.staff_side) or "").strip()
            )
            next_label = (
                attrs.get("staff_level_label", instance.profile.staff_level_label) or ""
            ).strip()
            if not next_side:
                next_side = actor_org.name if actor_org else ""
            if not next_side:
                raise serializers.ValidationError({"staff_side": "Staff side is required."})
            if next_label not in STAFF_ROLE_LEVELS:
                raise serializers.ValidationError(
                    {"staff_level_label": f"Choose one of: {', '.join(STAFF_ROLE_LEVELS)}."}
                )
            attrs["staff_side"] = next_side
            attrs["staff_level_label"] = next_label
            attrs["staff_level"] = STAFF_ROLE_LEVELS[next_label]
        elif target_role == Profile.ROLE_CUSTOMER:
            attrs["agent_office"] = None
            attrs["staff_side"] = ""
            attrs["staff_level"] = 1
            attrs["staff_level_label"] = ""
            next_country = (
                attrs.get("agent_country", instance.profile.agent_country) or ""
            ).strip()
            next_salary = attrs.get("agent_salary", instance.profile.agent_salary)
            if not next_country:
                raise serializers.ValidationError(
                    {"agent_country": "Country is required for agent accounts."}
                )
            if next_salary in (None, ""):
                raise serializers.ValidationError(
                    {"agent_salary": "Salary is required for agent accounts."}
                )
            attrs["agent_country"] = next_country
        else:
            attrs["agent_office"] = None
            attrs["staff_side"] = ""
            attrs["staff_level"] = 1
            attrs["staff_level_label"] = ""
            attrs["agent_country"] = ""
            attrs["agent_commission"] = None
            attrs["agent_salary"] = None
        if instance and is_admin(actor) and not is_superadmin(actor):
            if target_role not in (Profile.ROLE_STAFF, Profile.ROLE_CUSTOMER):
                raise serializers.ValidationError(
                    "You do not have permission to modify this account."
                )
        return attrs

    def update(self, instance, validated_data):
        has_agent_country = "agent_country" in validated_data
        has_agent_commission = "agent_commission" in validated_data
        has_agent_salary = "agent_salary" in validated_data
        has_agent_office = "agent_office" in validated_data
        role = validated_data.pop("role", None)
        agent_office = validated_data.pop("agent_office", None)
        validated_data.pop("agent_office_id", None)
        phone = validated_data.pop("phone", None)
        agent_country = validated_data.pop("agent_country", None)
        agent_commission = validated_data.pop("agent_commission", None)
        agent_salary = validated_data.pop("agent_salary", None)
        staff_side = validated_data.pop("staff_side", None)
        staff_level = validated_data.pop("staff_level", None)
        staff_level_label = validated_data.pop("staff_level_label", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        profile, _ = Profile.objects.get_or_create(
            user=instance,
            defaults={"role": Profile.ROLE_CUSTOMER},
        )
        if role is not None:
            profile.role = role
        if has_agent_office:
            profile.agent_office = agent_office
        if phone is not None:
            profile.phone = phone
        if has_agent_country:
            profile.agent_country = agent_country
        if has_agent_commission:
            profile.agent_commission = agent_commission
        if has_agent_salary:
            profile.agent_salary = agent_salary
        if staff_side is not None:
            profile.staff_side = staff_side
        if staff_level is not None:
            profile.staff_level = staff_level
        if staff_level_label is not None:
            profile.staff_level_label = staff_level_label
        profile.save()
        if profile.role == Profile.ROLE_CUSTOMER:
            ensure_agent_office_for_owner(instance, organization=profile.organization)
        elif profile.role == Profile.ROLE_STAFF and profile.agent_office_id:
            AgentMembership.objects.update_or_create(
                user=instance,
                defaults={
                    "agent_office": profile.agent_office,
                    "role": AgentMembership.ROLE_STAFF,
                    "is_active": instance.is_active,
                },
            )
        else:
            AgentMembership.objects.filter(user=instance).delete()
        OrganizationMembership.objects.update_or_create(
            user=instance,
            defaults={
                "organization": profile.organization,
                "role": profile.role,
                "is_owner": profile.role == Profile.ROLE_SUPERADMIN,
                "is_active": instance.is_active,
            },
        )
        return instance


class AdminPasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs


class PublicRegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        if User.objects.filter(username__iexact=attrs["username"].strip()).exists():
            raise serializers.ValidationError({"username": "Username already taken."})
        if User.objects.filter(email__iexact=attrs["email"].strip().lower()).exists():
            raise serializers.ValidationError({"email": "Email already registered."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        username = validated_data["username"].strip()
        email = validated_data["email"].strip().lower()
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            is_active=False,
        )
        profile = user.profile
        profile.email_verified = False
        profile.role = Profile.ROLE_CUSTOMER
        profile.save(update_fields=["email_verified", "role"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs


class CompanySuperadminResetTokenSerializer(serializers.Serializer):
    token = serializers.CharField()

    def validate_token(self, value):
        token = (value or "").strip()
        if not token:
            raise serializers.ValidationError("Reset token is required.")
        return token


class CompanySuperadminResetConfirmSerializer(CompanySuperadminResetTokenSerializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs


class VerifyEmailCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=32)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_code(self, value):
        digits = "".join(c for c in value if c.isdigit())
        if len(digits) != 6:
            raise serializers.ValidationError("Enter the 6-digit code from your email.")
        return digits


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()
