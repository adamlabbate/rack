"""Who can borrow from whom. Used by the social endpoints and by the stylist.

A user can borrow any shared item owned by a friend or by someone in one of their groups.
"""

from sqlmodel import Session, select

from db import Friendship, GroupMember, Item, User


def friend_ids(session: Session, user_id: int) -> set[int]:
    return set(session.exec(select(Friendship.friend_id).where(Friendship.user_id == user_id)).all())


def group_mate_ids(session: Session, user_id: int) -> set[int]:
    my_groups = select(GroupMember.group_id).where(GroupMember.user_id == user_id)
    return set(session.exec(select(GroupMember.user_id).where(GroupMember.group_id.in_(my_groups))).all())


def lender_ids(session: Session, user_id: int) -> set[int]:
    """Everyone whose shared items this user can borrow."""
    return (friend_ids(session, user_id) | group_mate_ids(session, user_id)) - {user_id}


def shared_items(session: Session, user_id: int) -> list[tuple[Item, str]]:
    """(item, owner name) for every shared item the user can borrow, grouped by owner."""
    rows = session.exec(
        select(Item, User.name)
        .join(User, User.id == Item.owner_id)
        .where(Item.owner_id.in_(lender_ids(session, user_id)), Item.shared)
        .order_by(Item.owner_id, Item.id)
    ).all()
    return [(item, name) for item, name in rows]
