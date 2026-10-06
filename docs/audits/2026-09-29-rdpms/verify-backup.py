"""Reproduce backup-pg.sh symlink snapshot aliasing using disposable files only."""
import json, pathlib, subprocess, tempfile, platform
with tempfile.TemporaryDirectory(prefix='rdpms-backup-audit-') as tmp:
    root = pathlib.Path(tmp)
    source, snapshots = root/'uploads', root/'snapshots'
    source.mkdir(); snapshots.mkdir()
    (source/'old.txt').write_text('original')
    first, second = snapshots/'snapshot1', snapshots/'snapshot2'
    first.mkdir()
    subprocess.run(['rsync','-a','--delete',str(source)+'/',str(first)+'/'],check=True)
    (snapshots/'latest').symlink_to(first, target_is_directory=True)
    subprocess.run(['cp','-al',str(snapshots/'latest'),str(second)],check=True)
    (source/'old.txt').unlink(); (source/'new.txt').write_text('new backup')
    subprocess.run(['rsync','-a','--delete',str(source)+'/',str(second)+'/'],check=True)
    result = {'id':'D01_BACKUP_SNAPSHOT_ALIASES_HISTORY','platform':platform.platform(),
              'secondSnapshotIsSymlink':second.is_symlink(),
              'oldFileLostFromFirstSnapshot':not (first/'old.txt').exists(),
              'newFileAppearedInFirstSnapshot':(first/'new.txt').exists()}
    assert all(result[k] for k in ['secondSnapshotIsSymlink','oldFileLostFromFirstSnapshot','newFileAppearedInFirstSnapshot'])
    result['defectReproduced']=True
    print(json.dumps(result,indent=2))
